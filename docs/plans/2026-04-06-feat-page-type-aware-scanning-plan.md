---
title: "Page-Type-Aware Scanning Optimization"
type: feat
date: 2026-04-06
---

# Page-Type-Aware Scanning Optimization

## Overview

Optimize the content script's periodic scanning to only run on pages where blocking is useful (home feed, search results, watch sidebar) instead of every YouTube page. This eliminates wasted CPU on watch/shorts/channel pages and fixes a bug where keyword dismissal automation on watch pages triggers video navigation instead of the "Not Interested" menu.

Brainstorm: `docs/brainstorms/2026-04-06-scanning-optimization-brainstorm.md`

## Proposed Solution

Add YouTube SPA navigation detection via the `yt-navigate-finish` event. Determine page type from `location.pathname`. Clear/set the periodic `setInterval` based on whether the current page has scannable content. Guard the MutationObserver callback with a page-type check. Suppress keyword dismissal (but not hiding) on watch pages to prevent the auto-navigation bug.

## Technical Approach

### Page Type Detection

New function near the top of `content/content.js` (after selector constants, before settings):

```javascript
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
```

### Per-Page Scan Behavior

| Page Type | `removeMatchingElements` | `scanForKeywordMatches` | `scanForPrimetimeMovies` | Keyword Dismissal |
|---|---|---|---|---|
| `feed` | Yes | Yes | Yes | Yes |
| `search` | Yes | Yes | No | Yes |
| `watch` | Yes | Yes (hide only) | No | **No** |
| `shorts` | No | No | No | No |
| `channel` | No | No | No | No |
| `other` | No | No | No | No |

### Navigation Handler

New state variables and handler in the MutationObserver section of `content/content.js`:

```javascript
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

  // Reset scan markers — new page has new content
  document.querySelectorAll(VIDEO_SELECTOR).forEach((el) => {
    delete el.dataset.ytbScanned;
  });
  document.querySelectorAll(PRIMETIME_SHELF_SELECTOR).forEach((el) => {
    delete el.dataset.ytbPrimetimeScanned;
  });

  if (SCANNING_PAGES.has(currentPageType)) {
    runAllScans();
    scanIntervalId = setInterval(runAllScans, 2000);
  }
}
```

### Modified Functions

**`onMutation()` — add page-type guard:**

```javascript
function onMutation() {
  if (!SCANNING_PAGES.has(currentPageType)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runAllScans, 200);
}
```

**`scanForKeywordMatches()` — suppress dismissal on watch pages:**

```javascript
if (matchesKeyword(title)) {
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  if (currentPageType !== "watch") {
    dismissalQueue.push({ el, retries: 0 });
  }
  matched = true;
}
```

**`runAllScans()` — page-type-aware scan selection:**

```javascript
function runAllScans() {
  removeMatchingElements();
  scanForKeywordMatches();
  if (currentPageType === "feed") {
    scanForPrimetimeMovies();
  }
}
```

**`startObserver()` — drop `characterData`, wire up navigation:**

```javascript
function startObserver() {
  const observer = new MutationObserver(onMutation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // characterData removed — we scan elements, not text
  });

  document.addEventListener("yt-navigate-finish", onNavigate);
  onNavigate(); // initial page load (event doesn't fire on first load)
}
```

**`init()` — remove the standalone `setInterval` from `startObserver`** (interval is now managed by `onNavigate`).

### What Does NOT Change

- `manifest.json` — no changes needed
- `content/content.css` — CSS rules remain the same
- `popup/popup.html`, `popup/popup.js` — no UI changes
- `chrome.storage.onChanged` listener — continues to react to settings changes
- `removeMatchingElements()` — runs on all scanning pages as-is
- `dismissVideo()` function — unchanged; the guard is in `scanForKeywordMatches`

## Implementation Phases

### Phase 1: Page Type Detection & Navigation Handler

**Goal:** Detect YouTube page type and respond to SPA navigation.

- [ ] Add `getPageType()` function and `SCANNING_PAGES` constant after selector constants in `content/content.js`
- [ ] Add `currentPageType` and `scanIntervalId` state variables
- [ ] Add `onNavigate()` function that determines page type, manages interval, and resets scan markers
- [ ] Wire `yt-navigate-finish` event listener in `startObserver()`
- [ ] Call `onNavigate()` at init time for initial page load

**Validation:** Open DevTools console. Navigate between YouTube home, a video, search results, and a channel page. Confirm `[YTBlocker]` logs show page type changes. Confirm no scanning-related logs appear on watch/shorts/channel pages.

### Phase 2: Guard Scanning Functions

**Goal:** Each scan only runs on appropriate pages.

- [ ] Add page-type guard to `onMutation()` — early return if not a scanning page
- [ ] Modify `runAllScans()` to only call `scanForPrimetimeMovies()` on feed pages
- [ ] Modify `scanForKeywordMatches()` to skip `dismissalQueue.push()` when `currentPageType === "watch"`
- [ ] Remove `characterData: true` from MutationObserver options in `startObserver()`
- [ ] Remove the standalone `setInterval(runAllScans, 2000)` from `startObserver()` (now managed by `onNavigate`)

**Validation:** Navigate to a watch page with keyword dismissal enabled. Confirm sidebar videos matching keywords get hidden (opacity:0) but NO menu clicks occur — no auto-navigation. Navigate to home feed and confirm full dismissal automation still works.

### Phase 3: Integration Testing

**Goal:** Verify all features work correctly across page types.

- [ ] Test Shorts blocking: home feed, search results, watch sidebar — elements hidden/removed on all scanning pages
- [ ] Test Playables blocking: same surfaces
- [ ] Test Primetime shelf removal: only on home feed
- [ ] Test keyword hide-only on watch page sidebar: videos hidden, no dismissal clicks, no navigation
- [ ] Test keyword dismissal on home feed: full "Not Interested" automation works with delays
- [ ] Test SPA navigation: click between pages rapidly, confirm no stale intervals or scan marker issues
- [ ] Test browser back/forward: confirm `yt-navigate-finish` fires and page type updates
- [ ] Test initial page load on each page type (direct URL navigation, not SPA): confirm `onNavigate()` fallback works
- [ ] Test toggling settings while on a non-scanning page: confirm settings save, scans don't run until navigating to a scanning page

**Validation:** All features work as before on feed/search pages. Watch page hides keyword matches without dismissal. Non-scanning pages have no console scan logs.

## Acceptance Criteria

### Functional Requirements

- [ ] Periodic scanning runs only on feed, search, and watch pages
- [ ] Shorts/Playables blocking works on feed, search, and watch sidebar
- [ ] Primetime shelf removal works on feed pages only
- [ ] Keyword-matched videos on watch page sidebar are hidden (opacity:0, pointer-events:none) but NOT dismissed
- [ ] Keyword dismissal automation works normally on feed and search pages
- [ ] Page type is correctly detected on initial load and SPA navigation
- [ ] Scan markers (`ytbScanned`, `ytbPrimetimeScanned`) reset on page navigation
- [ ] `yt-navigate-finish` event handles forward, back, and popstate navigation

### Non-Functional Requirements

- [ ] No `setInterval` ticking on watch/shorts/channel pages (zero CPU cost for scanning)
- [ ] `characterData` removed from MutationObserver options (fewer callbacks)
- [ ] MutationObserver callback returns early on non-scanning pages
- [ ] No regressions to existing Shorts, Playables, Primetime, or keyword dismissal features

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `yt-navigate-finish` stops firing | Low | Medium — falls back to no scanning on SPA navigation | `onNavigate()` at init handles direct loads; interval still works per-page |
| YouTube changes URL patterns | Low | Low — unknown paths fall to "other" (no scanning) | Conservative default; add new patterns as discovered |
| Scan markers not reset on navigation | Medium | Low — stale markers skip already-processed content | Explicit marker reset in `onNavigate()` |
| Watch page sidebar DOM differs from feed | Low | Low — `removeMatchingElements` and CSS hiding still work | Only dismissal is suppressed; hide-by-CSS/DOM-removal paths unchanged |

## References

- Brainstorm: `docs/brainstorms/2026-04-06-scanning-optimization-brainstorm.md`
- YouTube `yt-navigate-finish` event: used by SponsorBlock, YouTube-No-Translation, and other major extensions
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- Current implementation: `content/content.js:375-403` (observer setup and interval)
