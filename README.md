# Guidance

WebGuide AI is a Chrome extension that overlays an AI co-pilot on top of any web app so you can ask questions, highlight UI, and receive step-by-step instructions without leaving the page. The agent combines DOM snapshots, Gemini reasoning models, and Tavily web search to stay grounded in the live interface.

## Features

- **Persistent overlay tools** – Inject a control panel, run highlight/pulse effects (now continuous), and rescan the DOM on demand while keeping history across navigations.
- **DOM snapshot inventory** – Collect ≤50 high value actionable elements with metadata and keep a registry accessible from the console (`window.WebGuideAI.elementRegistry`).
- **Gemini integration** – Call planner/executor models (with automatic model fallback & rate-limit handling) to produce JSON actions grounded in the current DOM.
- **Tavily search** – Run advanced web queries (time range, max results, content format) with local API key storage and automatic retries.
- **Realtime agent log** – The popup now streams every planner/executor/tool event, including raw requests/responses, so you can watch what the agent is doing.
- **Robust controls** – Start/Stop/Reset buttons coordinate with the background worker, lock inputs while running, and ensure a fresh goal when restarting.

## Requirements

- Chrome 114+ (or any Chromium browser with Manifest V3).
- A Google AI Studio Gemini API key (Free tier works with the configured fallback models).
- Optional: Tavily API key for web search augmentation.

## Installation

Clone the repository locally:

```bash
git clone https://github.com/your-org/webguide-ai.git
cd webguide-ai
```

Load the extension:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select the `webguide-ai` folder inside this repo.
4. The WebGuide AI extension icon should appear in your toolbar.

## Usage

1. Browse to any `http(s)` page you want to automate or explore.
2. Click the WebGuide AI toolbar icon to open the popup.
3. **Manage API keys**
   - Keys are hidden by default. Click **Manage API Keys** in the popup footer to reveal the card.
   - Paste your Gemini key (required) and, optionally, your Tavily key. Each field has a *Show/Hide* toggle and a close button to collapse the section when you’re done.
   - If the agent encounters a missing/invalid key it auto-opens the relevant section and focuses the input.
4. **Run the agent**
   - Enter a goal (e.g., “Find discounted running shoes”).
   - Adjust search defaults (time range, max results, chunks) if needed.
   - Click **Start Agent**. The live *Event Log* streams planner/executor/tool events; the overlay uses continuous pulse & extended highlight cues until you move on.
   - Use **Stop** to halt (and clear the goal) or **Reset** to wipe history/logs and unlock the Start button for a new goal.

## Repo Layout (key files)

- `background.js` – Service worker orchestrating start/stop/reset, content script reinjection, log storage, and navigation events.
- `content-script.js` – Maintains the overlay UI, handles DOM snapshots, MutationObserver, and message routing.
- `overlay.js` + `styles/overlay.css` – Shadow DOM overlay components: persistent pulse, long-lived highlight, tooltips.
- `dom-snapshot.js` – Element discovery, ranking, and registry management with mutation tracking.
- `agent/` – Planner/executor loop (`orchestrator.js`), rate limiter with smart model fallback, tool definitions/validators, memory persistence.
- `popup/` – Popup UI with the streamlined agent console, event log, and collapsible API key management.
- `prompts/` – System prompts and JSON schemas fed to Gemini models.

## Development Notes

- Commands/messages are routed via `chrome.runtime` message passing; check the background service worker console for agent logs prefixed with `[WebGuideAI][Agent]`.
- The popup’s *Event Log* mirrors those logs via `wga-agent-log` broadcasts and is now backed by unit tests (`tests/popupKeys.test.mjs`).
- Rate limiter (`agent/rateLimiter.js`) detects 429/“too many requests” responses and cycles through configured Gemini models before surfacing an error.
- Tests: `node tests/rateLimiter.smoke.mjs` (rate limiter sanity) and `node --test tests/popupKeys.test.mjs` (popup API key UX) cover the current behaviour.

## Contributing

- Fork & branch from `main` for feature work.
- Keep directory-level READMEs updated when functionality changes.
- Prefer `rg` for search and adhere to the existing logging pattern (`[WebGuideAI][…]`).
