const RETRY_COUNT = 4;
const RETRY_DELAY_MS = 300;

// Promise-based delay for retry/backoff flows.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Basic visibility check for interactive candidates.
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

// Choose the largest visible element by area.
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

// Find the best input candidate using site-specific then generic heuristics.
function findInputCandidate() {
  const host = window.location.host;
  if (host.includes("chatgpt.com")) {
    const gptEl =
      document.querySelector("#prompt-textarea") ||
      document.querySelector("[data-testid='prompt-textarea']") ||
      document.querySelector("div[contenteditable='true'][data-testid='prompt-textarea']");
    if (gptEl && isVisible(gptEl)) return { el: gptEl, kind: "contenteditable" };
  }

  if (host.includes("claude.ai")) {
    const claudeEl =
      document.querySelector("[data-testid='chat-input']") ||
      document.querySelector("div[contenteditable='true'][role='textbox'][data-testid='chat-input']") ||
      document.querySelector("div[contenteditable='true'][role='textbox']");
    if (claudeEl && isVisible(claudeEl)) return { el: claudeEl, kind: "contenteditable" };
  }

  if (host.includes("perplexity.ai")) {
    const pplxEl =
      document.querySelector("#ask-input") ||
      document.querySelector("div[contenteditable='true'][role='textbox']");
    if (pplxEl && isVisible(pplxEl)) return { el: pplxEl, kind: "contenteditable" };
  }

  if (host.includes("gemini.google.com")) {
    const geminiEl =
      document.querySelector("rich-textarea .ql-editor[contenteditable='true']") ||
      document.querySelector(".ql-editor[contenteditable='true'][role='textbox']");
    if (geminiEl && isVisible(geminiEl)) return { el: geminiEl, kind: "contenteditable" };
  }

  const textarea = pickLargest(Array.from(document.querySelectorAll("textarea")));
  if (textarea) return { el: textarea, kind: "textarea" };

  const contentEditableCandidates = Array.from(
    document.querySelectorAll(
      "[contenteditable='true'], [contenteditable=''], [contenteditable=true], [role='textbox']"
    )
  ).filter((el) => el.isContentEditable);
  const contentEditable = pickLargest(contentEditableCandidates);
  if (contentEditable) return { el: contentEditable, kind: "contenteditable" };

  const inputText = pickLargest(
    Array.from(document.querySelectorAll("input[type='text']"))
  );
  if (inputText) return { el: inputText, kind: "input" };

  return null;
}

// Dispatch an input event that many editors listen for.
function dispatchInputEvent(el) {
  try {
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: el.textContent || ""
      })
    );
  } catch (_err) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// Best-effort beforeinput to satisfy editors requiring it.
function dispatchBeforeInputEvent(el, text) {
  try {
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      })
    );
  } catch (_err) {
    // Some editors do not support beforeinput.
  }
}

// Move caret to the end of a contenteditable element.
function moveCaretToEnd(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (_err) {
    // Ignore selection errors for shadow/virtual DOM editors.
  }
}

// Insert text into textarea/input/contenteditable with editor-friendly events.
function setText(el, kind, text) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.click();
  el.focus({ preventScroll: true });
  if (kind === "textarea" || kind === "input") {
    el.value = text;
    dispatchInputEvent(el);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (kind === "contenteditable") {
    const isGeminiEditor =
      window.location.host.includes("gemini.google.com") &&
      (el.classList.contains("ql-editor") || el.closest("rich-textarea")); 

    dispatchBeforeInputEvent(el, text);
    let inserted = false;
    const isPerplexityEditor = window.location.host.includes("perplexity.ai");
    if (!isPerplexityEditor && typeof document.execCommand === "function") {
      console.log("🚀 1")
      try {
        document.execCommand("selectAll", false, null);
        inserted = document.execCommand("insertText", false, text);
        console.log("🚀 2")
      } catch (_err) {
        console.log("🚀 3")
        inserted = false;
      }
    }
    
    if (!inserted) {
      console.log("🚀 4")
      const p = document.createElement("p");
      p.textContent = text;
      if (isGeminiEditor) {
        console.log("🚀 5")
        // Quill editors expect a <p> inside the contenteditable container.
        el.innerHTML = "";
        el.appendChild(p);
      } else {
        console.log("🚀 6");
        el.replaceChildren(p);
      }
    }
    moveCaretToEnd(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    dispatchInputEvent(el);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }
}

// Poll for an enabled send button within a small retry window.
async function waitForSendButton(startEl, attempts, delayMs) {
  for (let i = 0; i < attempts; i += 1) {
    const btn = findSendButton(startEl);
    if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      return btn;
    }
    await sleep(delayMs);
  }
  return null;
}

// Check localized send keywords.
function hasSendKeyword(label) {
  const normalized = label.toLowerCase().trim();
  const keywords = [
    "send",
    "submit",
    "send message",
    "보내기",
    "전송"
  ];
  return keywords.some((k) => normalized.includes(k));
}

// Identify send buttons by label/test id.
function matchesSendLabel(el) {
  const label =
    (el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent ||
      "") + "";
  if (hasSendKeyword(label)) return true;

  const dataTestId = (el.getAttribute("data-testid") || "") + "";
  if (hasSendKeyword(dataTestId)) return true;

  return false;
}

// Locate a usable send button near the input or globally as fallback.
function findSendButton(startEl) {
  if (window.location.host.includes("gemini.google.com")) {
    const geminiBtn =
      document.querySelector("button.send-button") ||
      document.querySelector("button[aria-label*='메시지 보내기']") ||
      document.querySelector("button[aria-label*='send']");
    if (geminiBtn && isVisible(geminiBtn) && !geminiBtn.disabled) return geminiBtn;
  }

  const roots = [];
  const form = startEl.closest("form");
  if (form) roots.push(form);
  roots.push(startEl);
  roots.push(startEl.parentElement);
  roots.push(startEl.closest("section"));
  roots.push(startEl.closest("main"));
  roots.push(document.body);

  for (const root of roots) {
    if (!root) continue;
    const buttons = Array.from(
      root.querySelectorAll("button, [role='button'], input[type='submit']")
    ).filter((btn) => isVisible(btn) && !btn.disabled);

    const submitButton = buttons.find(
      (btn) => btn.tagName === "BUTTON" && btn.getAttribute("type") === "submit"
    );

    if (submitButton) return submitButton;

    const labeled = buttons.find(matchesSendLabel);
    if (labeled) return labeled;
  }

  const globalButtons = Array.from(
    document.querySelectorAll("button, [role='button'], input[type='submit']")
  ).filter((btn) => isVisible(btn) && !btn.disabled);
  const globalLabeled = globalButtons.find(matchesSendLabel);
  if (globalLabeled) return globalLabeled;

  return null;
}

// Dispatch Enter keypress as a fallback send action.
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

// Orchestrate input + send with retries.
async function attemptSend(text) {
  for (let i = 0; i < RETRY_COUNT; i += 1) {
    const candidate = findInputCandidate();
    if (!candidate) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    const { el, kind } = candidate;
    setText(el, kind, text);
    await sleep(300);

    const sendButton = await waitForSendButton(el, 8, 300);
    if (sendButton) {
      sendButton.click();
      return { ok: true };
    }

    dispatchEnter(el);
    return { ok: true };
  }

  return { ok: false, error: "Input not found" };
}

// Handle popup requests to send text.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ASKALL_SEND") return;

  attemptSend(message.text)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
