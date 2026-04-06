# Scanning Optimization — Brainstorm

**Date:** 2026-04-06
**Status:** Ready for planning

## What We're Building

Page-type-aware scanning that eliminates wasted CPU on pages where content blocking has no effect, and ensures each page type only runs the scans appropriate to its DOM structure. Currently `setInterval(runAllScans, 2000)` fires unconditionally — on watch pages (where users spend most time), all 19 CSS selector queries find nothing. On top of reducing waste, this fixes a bug where keyword dismissal automation on watch pages triggers video navigation instead of the "Not Interested" menu.

## Why This Approach

**Chosen: Page-type detection via `yt-navigate-finish` + URL pathname**

| Approach | Complexity | CPU Savings | Risk |
|---|---|---|---|
| **Page-type detection (chosen)** | Low — ~30 lines | High — eliminates scanning on watch/shorts/channel pages | Low — URL patterns are stable |
| IntersectionObserver | Medium — viewport tracking, re-observe on navigation | Medium — still scans all pages, just fewer elements | Medium — YouTube lazy-loads titles after intersection |
| Narrow MutationObserver target | Medium — re-attach observer on every SPA navigation | Low-Medium — fewer mutation callbacks but interval unchanged | Medium — container elements may change |
| Disable interval entirely, rely on MutationObserver only | Low | High | High — YouTube populates titles lazily after elements are in DOM; MutationObserver may miss late title loads |

**Page-type detection wins because:**
- Eliminates the highest-cost problem (scanning on watch pages) with the simplest change
- YouTube's `yt-navigate-finish` event is the standard extension hook — used by SponsorBlock, YouTube-No-Translation, and others
- URL-based page type detection is synchronous, zero-cost, and stable across YouTube updates
- Keeps existing MutationObserver and interval architecture intact — minimal refactor risk

## Key Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scanning pages | Feed + search + watch sidebar | Covers all surfaces with scannable content. Channel/shorts pages have negligible value. |
| 2 | Observer strategy | Keep `document.body`, guard `onMutation` with page-type check | Simpler than re-attaching to narrow targets on every navigation. Debounce + guard handles the noise. |
| 3 | Interval strategy | Clear interval on non-scanning pages, set on scanning pages | Interval is the real cost (fires every 2s regardless of DOM activity). |
| 4 | Watch page keyword handling | Hide only (opacity + pointer-events) — NO dismissal | Dismissal automation clicks menu buttons on `ytd-compact-video-renderer` sidebar items, which triggers video navigation instead of "Not Interested". |
| 5 | Navigation detection | `yt-navigate-finish` event + `location.pathname` | Standard YouTube SPA event. URL parsing is sync and stable. |
| 6 | MutationObserver options | Drop `characterData: true` | We scan for elements, not text content. Free reduction in mutation callbacks. |

## Per-Page Scan Configuration

| Page Type | URL Pattern | `removeMatchingElements` | `scanForKeywordMatches` | `scanForPrimetimeMovies` | Keyword Dismissal |
|---|---|---|---|---|---|
| Home feed | `/`, `/feed/*` | Yes | Yes | Yes | Yes |
| Search results | `/results` | Yes | Yes | No (no shelves) | Yes |
| Watch sidebar | `/watch` | Yes | Yes (hide only) | No (no shelves) | **No** — causes auto-navigation |
| Shorts player | `/shorts/*` | No | No | No | No |
| Channel page | `/@*`, `/channel/*`, `/c/*` | No | No | No | No |
| Other | everything else | No | No | No | No |

### Watch Page Safety

The `dismissVideo()` function dispatches `mouseenter`/`mouseover` events, clicks the menu button, then looks for "Not Interested". On watch page sidebar items (`ytd-compact-video-renderer`), this flow can trigger video navigation because:
- Sidebar video cards have different interactive areas than feed cards
- Click events on menu-adjacent elements can propagate to the video link
- The "Not Interested" menu item may not exist in sidebar context menus

**Fix:** When `pageType === "watch"`, `scanForKeywordMatches` should still mark matching videos with `opacity: 0` + `pointer-events: none` but must NOT add them to `dismissalQueue`.

## Edge Cases & Mitigations

| Edge Case | Severity | Mitigation |
|---|---|---|
| `yt-navigate-finish` doesn't fire on initial page load | Critical | Call `onNavigate()` at init time as fallback — URL is already set |
| YouTube changes event name | Low | Extension would fall back to scanning everything (current behavior). No breakage, just lost optimization. |
| User navigates back/forward via browser buttons | Moderate | `yt-navigate-finish` fires on popstate-driven navigation too — confirmed by SponsorBlock usage |
| Feed page with zero scannable content (empty feed) | Low | Scans run but find nothing — same as today, no regression |
| Watch page sidebar has Shorts/Playables | Low | `removeMatchingElements` runs on watch pages, handles this via CSS + DOM removal (not dismissal) |
| Page type misdetection for new YouTube URL patterns | Low | Unknown paths fall through to "other" (no scanning) — conservative default. Add new patterns as discovered. |
| Interval cleared but MutationObserver still fires scans | None | Intentional — observer is debounced and page-type-guarded. Catches late-loading content on scanning pages. |

## Implementation Sketch

```javascript
// Page type detection
function getPageType() {
  const path = location.pathname;
  if (path === "/" || path.startsWith("/feed/")) return "feed";
  if (path === "/results") return "search";
  if (path === "/watch") return "watch";
  if (path.startsWith("/shorts/")) return "shorts";
  if (path.startsWith("/@") || path.startsWith("/channel/") || path.startsWith("/c/")) return "channel";
  return "other";
}

const SCANNING_PAGES = new Set(["feed", "search", "watch"]);

// Navigation handler
let scanIntervalId = null;
let currentPageType = null;

function onNavigate() {
  const newType = getPageType();
  if (newType === currentPageType) return;
  currentPageType = newType;

  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  // Reset scan markers on page change
  document.querySelectorAll(VIDEO_SELECTOR).forEach((el) => {
    delete el.dataset.ytbScanned;
  });

  if (SCANNING_PAGES.has(currentPageType)) {
    runAllScans();
    scanIntervalId = setInterval(runAllScans, 2000);
  }
}

// Guard in onMutation
function onMutation() {
  if (!SCANNING_PAGES.has(currentPageType)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runAllScans, 200);
}

// Guard dismissal in scanForKeywordMatches
if (matchesKeyword(title)) {
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  if (currentPageType !== "watch") {
    dismissalQueue.push({ el, retries: 0 });
  }
}
```

## Open Questions

- Should we add a visual indicator in the popup showing which page type is detected? (Probably not — adds complexity for debugging-only value. Defer.)
- Should keyword-hidden sidebar videos on watch pages be fully removed from DOM instead of just hidden? (Hidden is safer — removal could break YouTube's sidebar rendering/scrolling.)

## User Requirements

- Periodic scanning must stop on non-feed pages (watch, shorts, channel) to reduce CPU waste
- Watch page sidebar must still hide keyword-matched videos but must NOT attempt dismissal automation
- All existing blocking features (Shorts, Playables, Primetime, Keywords) must continue working on feed and search pages
- No visible behavior change on pages where scanning is active

## Next Steps

Run `/c:plan` to generate implementation plan.
