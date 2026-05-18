(function () {
  "use strict";

  const shortsToggle = document.getElementById("shortsToggle");
  const playablesToggle = document.getElementById("playablesToggle");
  const primetimeToggle = document.getElementById("primetimeToggle");
  const keywordDismissalToggle = document.getElementById(
    "keywordDismissalToggle"
  );
  const channelBlockingToggle = document.getElementById(
    "channelBlockingToggle"
  );
  const playlistDismissalToggle = document.getElementById(
    "playlistDismissalToggle"
  );
  const keywordInput = document.getElementById("keywordInput");
  const addKeywordBtn = document.getElementById("addKeyword");
  const keywordList = document.getElementById("keywordList");
  const channelInput = document.getElementById("channelInput");
  const addChannelBtn = document.getElementById("addChannel");
  const channelList = document.getElementById("channelList");
  const delayMinInput = document.getElementById("delayMinInput");
  const delayMaxInput = document.getElementById("delayMaxInput");

  let keywords = [];
  let blockedChannels = [];

  // --- Load Settings ---

  chrome.storage.sync.get(
    {
      shortsBlocked: true,
      playablesBlocked: true,
      primetimeBlocked: true,
      keywordDismissalEnabled: false,
      channelBlockingEnabled: false,
      playlistDismissalEnabled: false,
      dismissalDelayMinSeconds: 3,
      dismissalDelayMaxSeconds: 7,
      keywords: [],
      blockedChannels: [],
    },
    (result) => {
      shortsToggle.checked = result.shortsBlocked;
      playablesToggle.checked = result.playablesBlocked;
      primetimeToggle.checked = result.primetimeBlocked;
      keywordDismissalToggle.checked = result.keywordDismissalEnabled;
      channelBlockingToggle.checked = result.channelBlockingEnabled;
      playlistDismissalToggle.checked = result.playlistDismissalEnabled;
      delayMinInput.value = result.dismissalDelayMinSeconds;
      delayMaxInput.value = result.dismissalDelayMaxSeconds;
      keywords = result.keywords;
      blockedChannels = result.blockedChannels;
      renderKeywords();
      renderChannels();
    }
  );

  // --- Toggle Handlers ---

  shortsToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ shortsBlocked: shortsToggle.checked });
  });

  playablesToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ playablesBlocked: playablesToggle.checked });
  });

  primetimeToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ primetimeBlocked: primetimeToggle.checked });
  });

  keywordDismissalToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
      keywordDismissalEnabled: keywordDismissalToggle.checked,
    });
  });

  channelBlockingToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
      channelBlockingEnabled: channelBlockingToggle.checked,
    });
  });

  playlistDismissalToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
      playlistDismissalEnabled: playlistDismissalToggle.checked,
    });
  });

  function clampDelay(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.round(number), 1), 120);
  }

  function saveDelaySettings(changedInput) {
    let minSeconds = clampDelay(delayMinInput.value, 3);
    let maxSeconds = clampDelay(delayMaxInput.value, 7);

    if (minSeconds > maxSeconds) {
      if (changedInput === delayMinInput) {
        maxSeconds = minSeconds;
      } else {
        minSeconds = maxSeconds;
      }
    }

    delayMinInput.value = minSeconds;
    delayMaxInput.value = maxSeconds;
    chrome.storage.sync.set({
      dismissalDelayMinSeconds: minSeconds,
      dismissalDelayMaxSeconds: maxSeconds,
    });
  }

  delayMinInput.addEventListener("change", () => {
    saveDelaySettings(delayMinInput);
  });
  delayMaxInput.addEventListener("change", () => {
    saveDelaySettings(delayMaxInput);
  });

  // --- List Management ---

  function saveList(storageKey, list) {
    chrome.storage.sync.set({ [storageKey]: list });
  }

  function renderList(listEl, list, save) {
    listEl.innerHTML = "";
    list.forEach((item, index) => {
      const li = document.createElement("li");

      const text = document.createElement("span");
      text.className = "kw-text";
      text.textContent = item.text;

      const caseBtn = document.createElement("button");
      caseBtn.className = "kw-case" + (item.caseSensitive ? " active" : "");
      caseBtn.textContent = item.caseSensitive ? "Aa" : "aa";
      caseBtn.title = item.caseSensitive ? "Case-sensitive" : "Case-insensitive";
      caseBtn.addEventListener("click", () => {
        list[index].caseSensitive = !list[index].caseSensitive;
        save();
        renderList(listEl, list, save);
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "kw-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        list.splice(index, 1);
        save();
        renderList(listEl, list, save);
      });

      li.append(text, caseBtn, removeBtn);
      listEl.appendChild(li);
    });
  }

  function addListItem(inputEl, list, save, render) {
    const text = inputEl.value.trim();
    if (!text) return;
    if (list.some((item) => item.text === text)) return;

    list.push({ text, caseSensitive: false });
    inputEl.value = "";
    save();
    render();
  }

  function saveKeywords() {
    saveList("keywords", keywords);
  }

  function saveChannels() {
    saveList("blockedChannels", blockedChannels);
  }

  function renderKeywords() {
    renderList(keywordList, keywords, saveKeywords);
  }

  function renderChannels() {
    renderList(channelList, blockedChannels, saveChannels);
  }

  function addKeyword() {
    addListItem(keywordInput, keywords, saveKeywords, renderKeywords);
  }

  function addChannel() {
    addListItem(channelInput, blockedChannels, saveChannels, renderChannels);
  }

  addKeywordBtn.addEventListener("click", addKeyword);
  keywordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addKeyword();
  });
  addChannelBtn.addEventListener("click", addChannel);
  channelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addChannel();
  });
})();
