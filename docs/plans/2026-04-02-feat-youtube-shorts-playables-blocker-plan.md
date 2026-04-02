---
title: "YouTube Shorts, Playables & Keyword Blocker Chrome Extension"
type: feat
date: 2026-04-02
---

# YouTube Shorts, Playables & Keyword Blocker Chrome Extension

## Overview

Build a Chrome extension (Manifest V3) that blocks YouTube Shorts and Playables across all YouTube surfaces, and automatically clicks "Not Interested" on videos matching a user-defined keyword blocklist. The extension uses CSS hiding + DOM removal for instant, flicker-free blocking and a human-paced automation for keyword-based dismissals.

Brainstorm: `docs/brainstorms/2026-04-02-ytblocker-brainstorm.md`

## Proposed Solution

Single content script architecture with three features controlled from a minimal popup UI:

1. **Shorts Blocker** — CSS hides Shorts elements instantly; MutationObserver removes them from DOM
2. **Playables Blocker** — Same approach for Playables/mini-game elements
3. **Keyword Dismisser** — Scans video titles against a keyword blocklist, programmatically clicks the three-dot menu → "Not Interested" with 3-5s random delays

All settings persisted via `chrome.storage.sync`.

## Technical Approach

### Architecture

```
ytblocker/
├── manifest.json          # MV3 manifest
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic (toggles, keyword management)
├── content/
│   ├── content.js         # Main content script (MutationObserver, blocking, dismissals)
│   └── content.css        # CSS rules for hiding Shorts/Playables
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "YTBlocker",
  "version": "1.0.0",
  "description": "Block YouTube Shorts, Playables, and auto-dismiss videos by keyword",
  "permissions": ["storage"],
  "host_permissions": ["*://*.youtube.com/*"],
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "css": ["content/content.css"],
      "js": ["content/content.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### Content Script Strategy

**CSS Hiding (content/content.css):**
- Uses YouTube's known selectors for Shorts shelves, Shorts links, Playables elements
- Applied at `document_start` for zero-flash hiding
- Dynamically toggled by adding/removing a class on `<html>` element based on user settings

**DOM Removal (content/content.js):**
- Single `MutationObserver` on `document.body` watching for `childList` and `subtree` changes
- On mutation: scan for Shorts/Playables elements matching known selectors, remove from DOM
- Debounce observer callback to avoid excessive processing during rapid DOM changes

**Known YouTube Selectors (will need maintenance as YouTube updates):**

Shorts:
- `ytd-rich-section-renderer` containing Shorts shelf
- `ytd-reel-shelf-renderer` — Shorts shelf on home
- `a[href*="/shorts/"]` — Shorts links in various contexts
- `ytd-guide-entry-renderer a[title="Shorts"]` — Sidebar Shorts link

Playables:
- Elements containing Playables branding/links (specific selectors TBD during implementation — inspect YouTube DOM)

### Keyword Dismisser Logic

```
1. Observer detects new video elements (ytd-rich-item-renderer, ytd-compact-video-renderer, etc.)
2. Extract title text from #video-title element within each
3. Check title against keyword blocklist (respecting per-keyword case sensitivity)
4. If match found, queue video element for dismissal
5. Process queue with 3-5s random delay between each:
   a. Click the three-dot menu button (ytd-menu-renderer button)
   b. Wait for menu popup to appear
   c. Click "Not interested" option
   d. Wait for confirmation, then proceed to next
6. If any step fails (menu doesn't appear, option not found), skip and move to next
```

**Queue management:**
- FIFO queue of matched elements
- `setInterval` or chained `setTimeout` with random 3000-5000ms delay
- Pause queue processing when tab is not visible (`document.hidden`)
- Resume on tab focus

### Popup UI

```
┌─────────────────────────────┐
│  YTBlocker                  │
├─────────────────────────────┤
│                             │
│  ☐ Block Shorts             │
│  ☐ Block Playables          │
│                             │
├─────────────────────────────┤
│  Keywords                   │
│  ┌───────────────────┬────┐ │
│  │ Add keyword...     │ + │ │
│  └───────────────────┴────┘ │
│  ┌─────────────────────────┐│
│  │ ASMR        [Aa] [×]   ││
│  │ mukbang     [aa] [×]   ││
│  │ day ## of   [aa] [×]   ││
│  └─────────────────────────┘│
│                             │
│  ☐ Enable keyword dismissal │
│                             │
└─────────────────────────────┘

[Aa] = case-sensitive toggle
[aa] = case-insensitive (default)
[×]  = remove keyword
```

### Storage Schema

```json
{
  "shortsBlocked": true,
  "playablesBlocked": true,
  "keywordDismissalEnabled": true,
  "keywords": [
    { "text": "ASMR", "caseSensitive": true },
    { "text": "mukbang", "caseSensitive": false }
  ]
}
```

Settings sync between popup and content script:
- Popup writes to `chrome.storage.sync`
- Content script listens via `chrome.storage.onChanged`
- Content script reads initial settings on load

## Implementation Phases

### Phase 1: Extension Skeleton & Shorts Blocking

**Goal:** Working extension that hides and removes Shorts from YouTube.

- [ ] Create `manifest.json` with MV3 config
- [ ] Create `content/content.css` with Shorts hiding rules
- [ ] Create `content/content.js` with MutationObserver for Shorts removal
- [ ] Create `popup/popup.html` with Shorts toggle
- [ ] Create `popup/popup.js` with storage read/write for Shorts toggle
- [ ] Create placeholder icons (simple colored squares are fine for dev)
- [ ] Test: Toggle Shorts blocking on/off, verify elements hidden on home feed, sidebar, search

**Validation:** Load unpacked extension, navigate YouTube, confirm Shorts shelves and links are hidden. Toggle off in popup, confirm they reappear.

### Phase 2: Playables Blocking

**Goal:** Add Playables blocking with same pattern as Shorts.

- [ ] Inspect YouTube DOM to identify Playables selectors
- [ ] Add Playables CSS hiding rules to `content/content.css`
- [ ] Add Playables DOM removal to existing MutationObserver in `content/content.js`
- [ ] Add Playables toggle to `popup/popup.html` and `popup/popup.js`
- [ ] Test: Toggle Playables blocking independently of Shorts

**Validation:** Playables elements hidden/removed when enabled. Shorts and Playables toggles work independently.

### Phase 3: Keyword Blocklist UI

**Goal:** Popup UI for managing keywords with case-sensitivity toggles.

- [ ] Add keyword input field and add button to `popup/popup.html`
- [ ] Add keyword list display with case-sensitivity toggle and delete button
- [ ] Add master "Enable keyword dismissal" toggle
- [ ] Implement storage read/write for keywords array in `popup/popup.js`
- [ ] Style the popup with `popup/popup.css` — minimal, clean
- [ ] Test: Add, remove keywords. Toggle case sensitivity. Persist across popup open/close.

**Validation:** Keywords persist in `chrome.storage.sync`. Reopening popup shows saved keywords.

### Phase 4: "Not Interested" Automation

**Goal:** Content script scans video titles and auto-dismisses matches.

- [ ] Add title scanning logic to `content/content.js` — extract titles from video elements
- [ ] Add keyword matching with case-sensitivity support
- [ ] Implement dismissal queue with 3-5s random delay
- [ ] Implement the click sequence: three-dot menu → "Not interested"
- [ ] Add tab visibility check — pause when tab hidden
- [ ] Handle edge cases: menu doesn't appear, option not found, element removed before action
- [ ] Listen for `chrome.storage.onChanged` to react to keyword list updates
- [ ] Test: Add keyword, navigate to YouTube, confirm matching videos get dismissed with delays

**Validation:** Videos with matching titles are dismissed one-by-one with visible 3-5s delays. No errors in console. Queue pauses when switching tabs.

## Acceptance Criteria

### Functional Requirements

- [ ] Shorts are hidden across all YouTube surfaces when enabled (home, sidebar, search, end screens)
- [ ] Playables are hidden across all YouTube surfaces when enabled
- [ ] Each blocker (Shorts, Playables) has an independent enable/disable toggle
- [ ] Users can add keywords to a blocklist with per-keyword case-sensitivity control
- [ ] Videos matching keywords are automatically dismissed via "Not Interested"
- [ ] Dismissals happen with 3-5 second random delays between each
- [ ] Dismissal queue pauses when tab is not visible
- [ ] All settings persist across browser sessions via `chrome.storage.sync`
- [ ] Extension works on YouTube's SPA navigation (no page reload needed)

### Non-Functional Requirements

- [ ] No visible flash of Shorts/Playables before hiding (CSS loads at `document_start`)
- [ ] MutationObserver is debounced to avoid performance impact
- [ ] Extension works without any special permissions beyond `storage`
- [ ] Graceful failure: if YouTube DOM changes, blocking degrades silently (no errors thrown to user)

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| YouTube DOM changes break selectors | High (over time) | Medium — blocking stops working | Use multiple selector strategies; log warnings for maintainer |
| "Not Interested" menu flow changes | Medium | High — dismissal breaks | Wrap click sequence in try/catch; skip on failure |
| Rate limiting despite delays | Low | Medium — temp account restriction | 3-5s delay is conservative; pause on tab hidden reduces volume |
| YouTube detects automated clicking | Low | Medium | Random delays + human-like timing mitigate this |

## References

- [Chrome MV3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [MutationObserver API](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- Brainstorm: `docs/brainstorms/2026-04-02-ytblocker-brainstorm.md`
