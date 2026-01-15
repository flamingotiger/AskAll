const sendBtn = document.getElementById("sendBtn");
const questionEl = document.getElementById("question");
const statusEl = document.getElementById("status");

const TARGET_URLS = [
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://www.perplexity.ai/*"
];

function setStatus(successCount, failCount) {
  statusEl.textContent = `Success: ${successCount} / Fail: ${failCount}`;
}

async function queryTargetTabs() {
  return chrome.tabs.query({ url: TARGET_URLS });
}

async function sendToTab(tabId, text) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "ASKALL_SEND", text }, (resp) => {
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
