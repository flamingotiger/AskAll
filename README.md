# AskAll Chrome Extension

Ask a single question and send it to your ChatGPT, Claude, and Perplexity tabs at the same time.

## Install (Developer Mode)
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the `askall-extension` folder.

## How to use
1. Open each site in its own tab:
   - ChatGPT
   - Claude
   - Perplexity
2. Click the AskAll extension icon.
3. Type a question and click **Send to all**.
4. Check the status line for success/fail counts.

## Supported sites
- https://chat.openai.com/*
- https://claude.ai/*
- https://www.perplexity.ai/*

## Notes / Limitations
- Each site may change its UI or DOM structure; if sending stops working, update the selectors in `content.js`.
- The popup input keeps your last question after sending (it does not auto-clear).
- The extension uses content scripts and does not rely on any external libraries.
