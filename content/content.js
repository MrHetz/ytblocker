(function () {
  "use strict";

  const SHORTS_SELECTORS = [
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)",
    "ytd-rich-item-renderer:has(a[href*='/shorts/'])",
    "ytd-video-renderer:has(a[href*='/shorts/'])",
    "ytd-compact-video-renderer:has(a[href*='/shorts/'])",
    "ytd-grid-video-renderer:has(a[href*='/shorts/'])",
    "ytd-reel-item-renderer",
    "ytm-shorts-lockup-view-model",
  ];

  const PLAYABLES_SELECTORS = [
    "ytd-rich-section-renderer:has([href*='/playables'])",
    "ytd-rich-item-renderer:has([href*='/playables'])",
    "ytd-rich-shelf-renderer:has([href*='/playables'])",
    "ytd-compact-video-renderer:has([href*='/playables'])",
  ];

  const VIDEO_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
  ];

  const VIDEO_SELECTOR = VIDEO_SELECTORS.join(", ");

  const POPUP_SELECTORS =
    "tp-yt-iron-dropdown, ytd-popup-container, ytd-menu-popup-renderer, [role='listbox'], [role='menu']";

  const MENU_ITEM_SELECTORS =
    "ytd-menu-service-item-renderer, tp-yt-paper-item, [role='menuitem'], [role='option'], a, button, li";

  // --- Page Type Detection ---

  function getPageType() {
    const path = location.pathname;
    if (path === "/" || path.startsWith("/feed/")) return "feed";
    if (path === "/results") return "search";
    if (path === "/watch") return "watch";
    return null;
  }

  let currentPageType = null;
  let scanIntervalId = null;

  let settings = {
    shortsBlocked: true,
    playablesBlocked: true,
    primetimeBlocked: true,
    keywordDismissalEnabled: false,
    keywords: [],
  };

  let dismissalQueue = [];
  let isProcessingQueue = false;

  // --- Shared Helpers ---

  function getVideoTitle(videoEl) {
    const titleEl = videoEl.querySelector("#video-title")
      || videoEl.querySelector("h3[title]")
      || videoEl.querySelector("a.yt-lockup-metadata-view-model__title");
    if (!titleEl) return "";
    return titleEl.getAttribute("title")
      || titleEl.getAttribute("aria-label")
      || titleEl.textContent.trim()
      || "";
  }

  // --- Settings ---

  function applyToggleClasses() {
    document.documentElement.classList.toggle(
      "ytb-hide-shorts",
      settings.shortsBlocked
    );
    document.documentElement.classList.toggle(
      "ytb-hide-playables",
      settings.playablesBlocked
    );
  }

  function loadSettings() {
    chrome.storage.sync.get(
      {
        shortsBlocked: true,
        playablesBlocked: true,
        primetimeBlocked: true,
        keywordDismissalEnabled: false,
        keywords: [],
      },
      (result) => {
        settings = result;
        console.log("[YTBlocker] Settings loaded:", JSON.stringify({
          keywordDismissalEnabled: settings.keywordDismissalEnabled,
          keywords: settings.keywords,
        }));
        applyToggleClasses();
        runAllScans();
      }
    );
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    applyToggleClasses();
    if (currentPageType === null) return;

    if ("keywords" in changes || "keywordDismissalEnabled" in changes) {
      dismissalQueue.length = 0;
      document.querySelectorAll(VIDEO_SELECTOR).forEach((el) => {
        delete el.dataset.ytbScanned;
      });
      scanForKeywordMatches();
    }

    if ("primetimeBlocked" in changes && currentPageType === "feed") {
      scanForPrimetimeMovies();
    }
  });

  // --- DOM Removal ---

  function removeMatchingElements() {
    if (settings.shortsBlocked) {
      const selector = SHORTS_SELECTORS.join(", ");
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }
    if (settings.playablesBlocked) {
      const selector = PLAYABLES_SELECTORS.join(", ");
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }
  }

  // --- Keyword Matching ---

  function matchesKeyword(title) {
    if (!settings.keywordDismissalEnabled || settings.keywords.length === 0) {
      return false;
    }
    return settings.keywords.some((kw) => {
      if (kw.caseSensitive) {
        return title.includes(kw.text);
      }
      return title.toLowerCase().includes(kw.text.toLowerCase());
    });
  }

  function scanForKeywordMatches() {
    if (!settings.keywordDismissalEnabled || settings.keywords.length === 0) {
      return;
    }

    const allVideos = document.querySelectorAll(VIDEO_SELECTOR);
    let scannedCount = 0;
    let newCount = 0;
    let matched = false;

    allVideos.forEach((el) => {
      if (el.dataset.ytbScanned) { scannedCount++; return; }

      const title = getVideoTitle(el);
      if (!title) return;

      newCount++;
      el.dataset.ytbScanned = "true";

      if (matchesKeyword(title)) {
        console.log("[YTBlocker] Keyword match:", title);
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        if (currentPageType !== "watch") {
          dismissalQueue.push({ el, retries: 0 });
        }
        matched = true;
      }
    });

    if (matched) processQueue();

    if (newCount > 0) {
      console.log("[YTBlocker] Scan: total=" + allVideos.length + " alreadyScanned=" + scannedCount + " new=" + newCount + " queueSize=" + dismissalQueue.length);
    }
  }

  // --- Primetime Movies Blocking ---

  const PRIMETIME_SHELF_SELECTORS = [
    "ytd-rich-shelf-renderer",
    "ytd-rich-section-renderer",
    "ytd-shelf-renderer",
  ];

  const PRIMETIME_SHELF_SELECTOR = PRIMETIME_SHELF_SELECTORS.join(", ");

  function isPrimetimeShelf(el) {
    const titleEl =
      el.querySelector("#title-text") ||
      el.querySelector("[id='title'] yt-formatted-string") ||
      el.querySelector("#title");
    if (!titleEl) return false;
    return titleEl.textContent.trim().toLowerCase().includes("primetime");
  }

  function scanForPrimetimeMovies() {
    if (!settings.primetimeBlocked) return;

    const shelves = document.querySelectorAll(PRIMETIME_SHELF_SELECTOR);

    for (const shelf of shelves) {
      if (shelf.dataset.ytbPrimetimeScanned) continue;
      if (!isPrimetimeShelf(shelf)) {
        // Only skip future scans if the title element exists (i.e. loaded but not primetime).
        // If title hasn't loaded yet, leave unmarked so we re-check later.
        const titleEl = shelf.querySelector("#title-text")
          || shelf.querySelector("[id='title'] yt-formatted-string")
          || shelf.querySelector("#title");
        if (titleEl && titleEl.textContent.trim()) {
          shelf.dataset.ytbPrimetimeScanned = "true";
        }
        continue;
      }
      shelf.dataset.ytbPrimetimeScanned = "true";

      console.log("[YTBlocker] Primetime shelf removed");
      shelf.remove();
    }
  }

  // --- "Not Interested" Dismissal Queue ---

  function randomDelay() {
    return 1500 + Math.random() * 1500;
  }

  function waitForElement(parent, selector, timeout = 3000) {
    return new Promise((resolve) => {
      const existing = parent.querySelector(selector);
      if (existing) return resolve(existing);

      let timeoutId;
      const observer = new MutationObserver(() => {
        const el = parent.querySelector(selector);
        if (el) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(parent, { childList: true, subtree: true });

      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function findNotInterestedItem() {
    const popups = document.querySelectorAll(POPUP_SELECTORS);
    for (const popup of popups) {
      if (popup.getAttribute("aria-hidden") === "true") continue;
      // opacity:0 elements (from ytb-dismissing) still have offsetParent, so this works
      if (getComputedStyle(popup).display === "none") continue;

      const candidates = popup.querySelectorAll(MENU_ITEM_SELECTORS);
      for (const item of candidates) {
        if (item.textContent.trim().toLowerCase().includes("not interested")) {
          return item;
        }
      }
    }
    return null;
  }

  function getPopupMenuText() {
    const popups = document.querySelectorAll(POPUP_SELECTORS);
    const texts = [];
    for (const popup of popups) {
      if (popup.getAttribute("aria-hidden") === "true") continue;
      const items = popup.querySelectorAll(MENU_ITEM_SELECTORS);
      items.forEach((i) => texts.push(i.textContent.trim()));
    }
    return texts;
  }

  function closePopup() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.click();
  }

  async function dismissVideo(videoEl) {
    const title = getVideoTitle(videoEl) || "(unknown)";

    try {
      // Hover to trigger lazy rendering of the menu button
      videoEl.dispatchEvent(
        new MouseEvent("mouseenter", { bubbles: true, composed: true })
      );
      videoEl.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, composed: true })
      );

      const menuButton = await waitForElement(
        videoEl,
        "button[aria-label='More actions'], button[aria-label='Action menu'], ytd-menu-renderer button, yt-icon-button.dropdown-trigger",
        2000
      );
      if (!menuButton) {
        console.log("[YTBlocker] FAIL: menu button not found for:", title);
        return false;
      }

      console.log("[YTBlocker] Opening menu for:", title);
      document.documentElement.classList.add("ytb-dismissing");
      menuButton.click();

      await new Promise((r) => setTimeout(r, 500));

      const notInterestedItem = findNotInterestedItem();

      if (!notInterestedItem) {
        const allPopupText = getPopupMenuText();
        console.log("[YTBlocker] FAIL: 'Not interested' not found. Visible menu text:", allPopupText);
        closePopup();
        document.documentElement.classList.remove("ytb-dismissing");
        return false;
      }

      console.log("[YTBlocker] DISMISSED:", title);
      notInterestedItem.click();
      document.documentElement.classList.remove("ytb-dismissing");
      return true;
    } catch (e) {
      console.log("[YTBlocker] FAIL: error for:", title, e);
      closePopup();
      document.documentElement.classList.remove("ytb-dismissing");
      return false;
    }
  }

  const MAX_RETRIES = 2;

  function processQueue() {
    if (isProcessingQueue || dismissalQueue.length === 0) return;
    if (document.hidden) return;

    isProcessingQueue = true;

    async function processNext() {
      if (dismissalQueue.length === 0 || document.hidden || !settings.keywordDismissalEnabled) {
        isProcessingQueue = false;
        return;
      }

      const { el: videoEl, retries } = dismissalQueue.shift();

      if (videoEl.isConnected) {
        const success = await dismissVideo(videoEl);
        if (!success && retries < MAX_RETRIES) {
          dismissalQueue.push({ el: videoEl, retries: retries + 1 });
        }
      }

      setTimeout(processNext, randomDelay());
    }

    processNext();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dismissalQueue.length > 0 && !isProcessingQueue) {
      processQueue();
    }
  });

  // --- MutationObserver ---

  function runAllScans() {
    removeMatchingElements();
    scanForKeywordMatches();
    if (currentPageType === "feed") {
      scanForPrimetimeMovies();
    }
  }

  let debounceTimer = null;

  function onMutation() {
    if (currentPageType === null) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runAllScans, 200);
  }

  function init() {
    loadSettings();

    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver);
    }
  }

  function onNavigate() {
    currentPageType = getPageType();
    console.log("[YTBlocker] Page type:", currentPageType);

    clearInterval(scanIntervalId);
    scanIntervalId = null;
    clearTimeout(debounceTimer);

    if (currentPageType !== null) {
      // Reset scan markers — new page has new content
      document.querySelectorAll(VIDEO_SELECTOR).forEach((el) => {
        delete el.dataset.ytbScanned;
      });
      document.querySelectorAll(PRIMETIME_SHELF_SELECTOR).forEach((el) => {
        delete el.dataset.ytbPrimetimeScanned;
      });
      runAllScans();
      scanIntervalId = setInterval(runAllScans, 2000);
    }
  }

  function startObserver() {
    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("yt-navigate-finish", onNavigate);
    onNavigate();
  }

  init();
})();
