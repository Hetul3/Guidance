# WebGuide AI Extension

Base Chrome extension scaffold for WebGuide AI. This layer provides the popup trigger, background service worker placeholder, and a minimal overlay content script.

## Structure
- `manifest.json` — Manifest V3 configuration for the extension.
- `background.js` — Service worker bootstrap logging installation events.
- `popup/` — Popup UI and logic for injecting the overlay on demand.
- `content-script.js` — Injected script that renders the base banner, exposes feature-specific test hooks, and routes overlay demo messages.
- `overlay.js` — Shadow DOM overlay utilities for pulse/highlight effects (sequential triple pulses, tooltip highlights).
- `styles/` — Shared styles for injected overlays.

## Usage
1. Load the folder as an unpacked extension via `chrome://extensions`.
2. Open a standard web page (http/https) and click the extension icon.
3. Press "Activate Overlay" in the popup to load the content script and show the banner.
4. Use "Run Overlay Demo" to trigger the pulse/highlight showcase (optional per feature test); other modules can add their own demo buttons later.
