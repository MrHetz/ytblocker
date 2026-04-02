(function () {
  "use strict";

  const shortsToggle = document.getElementById("shortsToggle");
  const playablesToggle = document.getElementById("playablesToggle");
  const keywordDismissalToggle = document.getElementById(
    "keywordDismissalToggle"
  );
  const keywordInput = document.getElementById("keywordInput");
  const addKeywordBtn = document.getElementById("addKeyword");
  const keywordList = document.getElementById("keywordList");

  let keywords = [];

  // --- Load Settings ---

  chrome.storage.sync.get(
    {
      shortsBlocked: true,
      playablesBlocked: true,
      keywordDismissalEnabled: false,
      keywords: [],
    },
    (result) => {
      shortsToggle.checked = result.shortsBlocked;
      playablesToggle.checked = result.playablesBlocked;
      keywordDismissalToggle.checked = result.keywordDismissalEnabled;
      keywords = result.keywords;
      renderKeywords();
    }
  );

  // --- Toggle Handlers ---

  shortsToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ shortsBlocked: shortsToggle.checked });
  });

  playablesToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ playablesBlocked: playablesToggle.checked });
  });

  keywordDismissalToggle.addEventListener("change", () => {
    chrome.storage.sync.set({
      keywordDismissalEnabled: keywordDismissalToggle.checked,
    });
  });

  // --- Keyword Management ---

  function saveKeywords() {
    chrome.storage.sync.set({ keywords });
  }

  function renderKeywords() {
    keywordList.innerHTML = "";
    keywords.forEach((kw, index) => {
      const li = document.createElement("li");

      const text = document.createElement("span");
      text.className = "kw-text";
      text.textContent = kw.text;

      const caseBtn = document.createElement("button");
      caseBtn.className = "kw-case" + (kw.caseSensitive ? " active" : "");
      caseBtn.textContent = kw.caseSensitive ? "Aa" : "aa";
      caseBtn.title = kw.caseSensitive ? "Case-sensitive" : "Case-insensitive";
      caseBtn.addEventListener("click", () => {
        keywords[index].caseSensitive = !keywords[index].caseSensitive;
        saveKeywords();
        renderKeywords();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "kw-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        keywords.splice(index, 1);
        saveKeywords();
        renderKeywords();
      });

      li.append(text, caseBtn, removeBtn);
      keywordList.appendChild(li);
    });
  }

  function addKeyword() {
    const text = keywordInput.value.trim();
    if (!text) return;
    if (keywords.some((kw) => kw.text === text)) return;

    keywords.push({ text, caseSensitive: false });
    keywordInput.value = "";
    saveKeywords();
    renderKeywords();
  }

  addKeywordBtn.addEventListener("click", addKeyword);
  keywordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addKeyword();
  });
})();
