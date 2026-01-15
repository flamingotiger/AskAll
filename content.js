const RETRY_COUNT = 4;
const RETRY_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

function pickLargest(els) {
  let best = null;
  let bestArea = 0;
  els.forEach((el) => {
    if (!isVisible(el)) return;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  });
  return best;
}

function findInputCandidate() {
  const textarea = pickLargest(Array.from(document.querySelectorAll("textarea")));
  if (textarea) return { el: textarea, kind: "textarea" };

  const contentEditableCandidates = Array.from(
    document.querySelectorAll("[contenteditable='true'], [contenteditable=''], [contenteditable=true]")
  ).filter((el) => el.isContentEditable);
  const contentEditable = pickLargest(contentEditableCandidates);
  if (contentEditable) return { el: contentEditable, kind: "contenteditable" };

  const inputText = pickLargest(
    Array.from(document.querySelectorAll("input[type='text']"))
  );
  if (inputText) return { el: inputText, kind: "input" };

  return null;
}

function dispatchInputEvent(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setText(el, kind, text) {
  el.focus();
  if (kind === "textarea" || kind === "input") {
    el.value = text;
    dispatchInputEvent(el);
    return;
  }

  if (kind === "contenteditable") {
    el.textContent = text;
    dispatchInputEvent(el);
  }
}

function matchesSendLabel(el) {
  const label =
    (el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent ||
      "")
      .toLowerCase()
      .trim();
  return label.includes("send") || label.includes("submit");
}

function findSendButton(startEl) {
  const roots = [];
  const form = startEl.closest("form");
  if (form) roots.push(form);
  roots.push(startEl.closest("section") || startEl.parentElement || document.body);
  roots.push(document.body);

  for (const root of roots) {
    if (!root) continue;
    const buttons = Array.from(
      root.querySelectorAll("button, [role='button'], input[type='submit']")
    ).filter(isVisible);

    const submitButton = buttons.find(
      (btn) => btn.tagName === "BUTTON" && btn.getAttribute("type") === "submit"
    );
    if (submitButton) return submitButton;

    const labeled = buttons.find(matchesSendLabel);
    if (labeled) return labeled;
  }

  return null;
}

function dispatchEnter(el) {
  el.focus();
  const eventInit = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };
  el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  el.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

async function attemptSend(text) {
  for (let i = 0; i < RETRY_COUNT; i += 1) {
    const candidate = findInputCandidate();
    if (!candidate) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    const { el, kind } = candidate;
    setText(el, kind, text);
    await sleep(120);

    const sendButton = findSendButton(el);
    if (sendButton) {
      sendButton.click();
      return { ok: true };
    }

    dispatchEnter(el);
    return { ok: true };
  }

  return { ok: false, error: "Input not found" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ASKALL_SEND") return;

  attemptSend(message.text)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
