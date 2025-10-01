# Popup Module

Handles the user-facing control center for WebGuide AI.

## Files
- `popup.html` — Structured cards for quick actions, Gemini key management, and the Markdown-rendered Gemini chat. Includes links to the local Markdown/highlight bundles and styles.
- `popup.js` — Orchestrates overlay/snapshot messaging, Gemini key persistence, Markdown rendering, and inline status updates.
- `styles/chat.css` & `styles/highlight.css` — Presentation for Markdown typography and code highlighting in the chat response area.
- `vendor/marked-lite.js`, `vendor/dompurify-lite.js`, `vendor/highlight-lite.js` — Lightweight bundles for Markdown parsing, sanitisation, and syntax highlighting.

## Notes
- Overlay/demo/snapshot buttons rely on the content script; ensure the active tab is `http(s)`.
- Gemini chat calls the Gemini 2.0 Flash model (temperature 0). Responses render as sanitised Markdown with optional code highlighting. Missing/invalid keys prompt for re-entry and retry automatically.
- Ctrl/⌘+Enter in the textarea submits the chat prompt.
- Markdown support covers headings, emphasis, blockquotes, lists, tables, task lists, inline code, code fences, images, and links.
*** End Patch
PATCH
