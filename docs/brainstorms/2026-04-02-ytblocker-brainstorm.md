# YTBlocker Chrome Extension — Brainstorm

**Date:** 2026-04-02
**Status:** Ready for planning

## What We're Building

A Chrome extension that gives users control over unwanted YouTube content:

1. **Block YouTube Shorts** — Hide and remove Shorts from all YouTube surfaces (home feed, sidebar, search results, end screens). Toggle on/off from popup.

2. **Block YouTube Playables** — Hide and remove Playables (mini-games) from all YouTube surfaces. Toggle on/off from popup.

3. **Auto "Not Interested" by Keywords** — User maintains a keyword blocklist. Videos whose titles match any keyword get automatically dismissed via YouTube's "Not Interested" menu option. Each keyword has an optional case-sensitivity toggle. Actions are spaced 3-5 seconds apart (random) to avoid rate limiting.

## Why This Approach

- **CSS hiding + DOM removal** for Shorts/Playables: CSS hides elements instantly (no flash), MutationObserver removes them from DOM for clean results. Covers dynamic SPA loading.
- **Single content script architecture**: All three features are related DOM manipulation tasks. One MutationObserver, one script, clear internal functions. No need for modular separation at this scale.
- **Keyword blocklist with case-sensitivity toggle**: Simple and predictable. Users know exactly what's being matched. Per-keyword case control covers both "ASMR" (case-sensitive) and "mukbang" (case-insensitive) use cases.
- **3-5 second random delay**: Mimics human behavior. ~15 dismissals/minute is fast enough to clean a feed without triggering rate limits.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Blocking scope | All YouTube surfaces | User wants comprehensive blocking |
| Blocking method | CSS hide + DOM removal | Instant hiding, clean DOM, handles SPA |
| Title matching | Keyword blocklist | Simple, predictable, user-controlled |
| Case sensitivity | Per-keyword toggle | Flexible without complexity of regex |
| Dismissal delay | 3-5s random | Human-like, ~15/min throughput |
| UI style | Minimal & functional | Clean toggles, keyword list, no extras |
| Architecture | Single content script | YAGNI — one script, one observer |

## Core Components

- **manifest.json** — Chrome extension manifest (MV3)
- **popup.html / popup.js** — Toggle switches for Shorts/Playables, keyword list management
- **content.js** — MutationObserver-based DOM manipulation + "Not Interested" automation
- **styles.css** — CSS rules for instant element hiding
- **chrome.storage** — Persist settings (toggles, keywords) across sessions

## Open Questions

- Should dismissed videos be logged anywhere (e.g., a simple count in the popup)?
- Should there be an import/export for the keyword list?
- What happens if YouTube changes their DOM structure? (Answer: MutationObserver selectors will need updating — standard extension maintenance.)
