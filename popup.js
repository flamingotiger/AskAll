const sendBtn = document.getElementById("sendBtn");
const questionEl = document.getElementById("question");
const statusEl = document.getElementById("status");
const DRAFT_KEY = "askall_draft";
const TARGETS_KEY = "askall_targets";

// Cache target checkbox elements for quick access.
const targetEls = {
  chatgpt: document.getElementById("target-chatgpt"),
  claude: document.getElementById("target-claude"),
  perplexity: document.getElementById("target-perplexity"),
  gemini: document.getElementById("target-gemini")
};

// Full URL list used when no target is selected.
const TARGET_URLS = [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://www.perplexity.ai/*",
  "https://gemini.google.com/*"
];

// Map target keys to URL patterns.
const TARGET_MAP = {
  chatgpt: "https://chatgpt.com/*",
  claude: "https://claude.ai/*",
  perplexity: "https://www.perplexity.ai/*",
  gemini: "https://gemini.google.com/*"
};

// Update UI status text with result counts.
function setStatus(successCount, failCount) {
  statusEl.textContent = `Success: ${successCount} / Fail: ${failCount}`;
}

// Collect selected target keys from checkboxes.
function selectedTargets() {
  return Object.keys(targetEls).filter((key) => targetEls[key].checked);
}

// Persist target selection in local storage.
function saveTargets() {
  const selected = selectedTargets();
  chrome.storage.local.set({ [TARGETS_KEY]: selected });
}

// Restore target selection from local storage (default to all).
function loadTargets() {
  chrome.storage.local.get([TARGETS_KEY], (res) => {
    const saved = Array.isArray(res[TARGETS_KEY]) ? res[TARGETS_KEY] : [];
    const defaults = saved.length ? saved : Object.keys(targetEls);
    Object.keys(targetEls).forEach((key) => {
      targetEls[key].checked = defaults.includes(key);
    });
  });
}

// Persist draft text between popup openings.
function saveDraft(value) {
  chrome.storage.local.set({ [DRAFT_KEY]: value });
}

// Restore draft text when popup loads.
function loadDraft() {
  chrome.storage.local.get([DRAFT_KEY], (res) => {
    const draft = typeof res[DRAFT_KEY] === "string" ? res[DRAFT_KEY] : "";
    if (draft) questionEl.value = draft;
  });
}

// Query tabs matching selected target URL patterns.
async function queryTargetTabs() {
  const selected = selectedTargets();
  const urls = selected.length
    ? selected.map((key) => TARGET_MAP[key]).filter(Boolean)
    : TARGET_URLS;
  return chrome.tabs.query({ url: urls });
}

// Send message to a content script and normalize the response.
async function sendToTab(tabId, text) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "ASKALL_SEND", text }, (resp) => {
      console.log("🚀 ~ sendToTab ~ resp:", resp)
      if (chrome.runtime.lastError) {
        resolve({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      if (!resp || resp.ok !== true) {
        resolve({ ok: false, reason: resp?.error || "Unknown error" });
        return;
      }
      resolve({ ok: true });
    });
  });
}

sendBtn.addEventListener("click", async () => {
  const text = questionEl.value.trim();
  if (!text) {
    setStatus(0, 0);
    return;
  }

  sendBtn.disabled = true;
  const originalLabel = sendBtn.textContent;
  sendBtn.textContent = "Sending...";

  let successCount = 0;
  let failCount = 0;

  try {
    const selected = selectedTargets();
    if (!selected.length) {
      setStatus(0, 0);
      return;
    }

    const tabs = await queryTargetTabs();
    if (!tabs.length) {
      setStatus(0, 0);
    } else {
      const results = await Promise.all(
        tabs.map((tab) => sendToTab(tab.id, text))
      );
      results.forEach((r) => {
        if (r.ok) successCount += 1;
        else failCount += 1;
      });
      setStatus(successCount, failCount);
    }
  } catch (err) {
    setStatus(0, 1);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = originalLabel;
  }
});

questionEl.addEventListener("input", () => {
  saveDraft(questionEl.value);
});

Object.values(targetEls).forEach((el) => {
  el.addEventListener("change", saveTargets);
});

loadDraft();
loadTargets();
