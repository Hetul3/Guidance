# WebGuide AI Extension

Base Chrome extension scaffold for WebGuide AI. This layer provides the popup trigger, background service worker placeholder, and a minimal overlay content script.

## Structure
- `manifest.json` — Manifest V3 configuration for the extension.
- `background.js` — Service worker bootstrap logging installation events.
- `popup/` — Popup UI and logic for injecting the overlay on demand.
- `content-script.js` — Injected script that renders the base banner, exposes feature-specific test hooks, and routes overlay demo messages.
- `overlay.js` — Shadow DOM overlay utilities for pulse/highlight effects (sequential triple pulses, tooltip highlights).
- `dom-snapshot.js` — Collects structured metadata for clickable DOM elements (raw + filtered LLM views) with MutationObserver-backed refreshes and a live element registry for ID lookup.
- `storage.js` — Chrome storage helpers for persisting user-provided configuration (e.g., Gemini API key).
- `llm.js` — Lightweight Gemini wrapper that sends prompts to the 2.0 Flash model using the stored API key.
- `styles/chat.css`, `styles/highlight.css` — Markdown and code highlighting styles for Gemini responses.
- `vendor/marked-lite.js`, `vendor/dompurify-lite.js`, `vendor/highlight-lite.js` — Bundled utilities for Markdown parsing, sanitisation, and code highlighting within the popup.
- `styles/` — Shared styles for injected overlays.

## Usage
1. Load the folder as an unpacked extension via `chrome://extensions`.
2. Open a standard web page (http/https) and click the extension icon.
3. Press "Activate Overlay" in the popup to load the content script and show the banner.
4. Use "Run Overlay Demo" to trigger the pulse/highlight showcase (optional per feature test); other modules can add their own demo buttons later.
5. Use "Run DOM Snapshot" to log the current page’s clickable elements (`raw` and filtered `llm` snapshots) to the DevTools console.
6. Provide a Gemini API key through the popup (stored in `chrome.storage.local`) before exercising LLM-powered features.
7. Use the "Gemini Test Chat" section to send a quick prompt and verify the key/connection—responses render as sanitised Markdown with syntax-highlighted code. Ctrl/⌘+Enter submits.
8. Access `window.WebGuideAI.elementRegistry.get('el42')` in DevTools to retrieve the live DOM element backing a snapshot entry.
- `.env_example` documents expected environment variables for local scripts; copy to `.env` (gitignored) if needed outside the extension. Runtime keys are managed via the popup and `chrome.storage.local`.
