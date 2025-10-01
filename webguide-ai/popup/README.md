# Popup Module

Handles the action popup UI for WebGuide AI.

## Files
- `popup.html` — Minimal interface with activation controls, overlay demo trigger, DOM snapshot trigger, Gemini API key form, lightweight chat area, and status messaging.
- `popup.js` — Queries the active tab, validates the URL, injects the overlay/content script, manages Gemini API key storage, sends feature-specific test commands (overlay demo, DOM snapshot), wires the Gemini test chat, and renders Markdown responses.
- `styles/chat.css`, `styles/highlight.css` — Encapsulate Markdown typography and syntax highlighting for Gemini responses.
- `vendor/marked-lite.js`, `vendor/dompurify-lite.js`, `vendor/highlight-lite.js` — Bundled utilities to parse Markdown, sanitise HTML, and highlight code inside the popup.

## Notes
- Injection is limited to `http(s)` tabs to avoid restricted pages like `chrome://`.
- Overlay demo remains optional; other feature tests can reuse the shared messaging channel without triggering overlay visuals.
- Demo button currently calls the overlay module, which spawns three sequential pulses to avoid flicker and adds a tooltip highlight.
- DOM snapshot button calls into the snapshot module and logs both raw developer metadata and compact LLM descriptors (filtered to ~50 high-priority items) to the page console, updating the popup status with element totals.
- API key form persists the Gemini key in `chrome.storage.local`, masking stored values and confirming saves inline.
- Gemini chat area sends prompts to the Gemini 2.0 Flash model (temperature 0) using the stored key; responses render as sanitised Markdown with optional code highlighting. Missing/invalid keys trigger a re-entry prompt before retrying.
- Status text uses semantic `role="status"` for accessibility and inline messaging.
