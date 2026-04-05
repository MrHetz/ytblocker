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

  let settings = {
    shortsBlocked: true,
    playablesBlocked: true,
    keywordDismissalEnabled: false,
    keywords: [],
  };

  let dismissalQueue = [];
  let isProcessingQueue = false;

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
        keywordDismissalEnabled: false,
        keywords: [],
      },
      (result) => {
        settings = result;
        applyToggleClasses();
      }
    );
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    applyToggleClasses();

    if ("keywords" in changes || "keywordDismissalEnabled" in changes) {
      dismissalQueue.length = 0;
      const selector = VIDEO_SELECTORS.join(", ");
      document.querySelectorAll(selector).forEach((el) => {
        delete el.dataset.ytbScanned;
      });
      scanForKeywordMatches();
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

    const selector = VIDEO_SELECTORS.join(", ");
    document.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.ytbScanned) return;
      el.dataset.ytbScanned = "true";

      const titleEl = el.querySelector("#video-title");
      if (!titleEl) return;

      const title = titleEl.textContent.trim();
      if (matchesKeyword(title)) {
        dismissalQueue.push(el);
        processQueue();
      }
    });
  }

  // --- "Not Interested" Dismissal Queue ---

  function randomDelay() {
    return 3000 + Math.random() * 2000;
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
      observer.observe(document.body, { childList: true, subtree: true });

      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function dismissVideo(videoEl) {
    try {
      const menuButton = videoEl.querySelector(
        "ytd-menu-renderer button, yt-icon-button.dropdown-trigger, button[aria-label='Action menu']"
      );
      if (!menuButton) return false;

      menuButton.click();

      const popup = await waitForElement(
        document.body,
        "tp-yt-iron-dropdown:not([aria-hidden='true']), ytd-popup-container ytd-menu-popup-renderer"
      );
      if (!popup) return false;

      const menuItems = popup.querySelectorAll(
        "ytd-menu-service-item-renderer"
      );
      let notInterestedItem = null;

      for (const item of menuItems) {
        const text = item.textContent.trim().toLowerCase();
        if (text.includes("not interested")) {
          notInterestedItem = item;
          break;
        }
      }

      if (!notInterestedItem) {
        document.body.click();
        return false;
      }

      notInterestedItem.click();
      return true;
    } catch {
      return false;
    }
  }

  function processQueue() {
    if (isProcessingQueue || dismissalQueue.length === 0) return;
    if (document.hidden) return;

    isProcessingQueue = true;

    async function processNext() {
      if (dismissalQueue.length === 0 || document.hidden || !settings.keywordDismissalEnabled) {
        isProcessingQueue = false;
        return;
      }

      const videoEl = dismissalQueue.shift();
      if (videoEl.isConnected) {
        await dismissVideo(videoEl);
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

  let debounceTimer = null;

  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      removeMatchingElements();
      scanForKeywordMatches();
    }, 200);
  }

  function init() {
    loadSettings();

    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver);
    }
  }

  function startObserver() {
    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });
    removeMatchingElements();
    scanForKeywordMatches();
  }

  init();
})();
