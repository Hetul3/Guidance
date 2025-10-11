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
3. **Overlay controls**
   - *Activate Overlay*: injects the content script and opens the control panel on the page.
   - *Run Overlay Demo*: shows the pulse/highlight demo (pulse now runs continuously until navigation).
   - *Run DOM Snapshot*: triggers a scan and logs the element counts.
4. **Configure APIs**
   - Gemini: Paste your API key in *Gemini Access → Save Key*.
   - Tavily (optional): Save your key in *Tavily Search → Save Key*.
5. **Chat & search**
   - Use the chat input for ad-hoc Gemini prompts (Markdown rendered safely).
   - Tavily search supports advanced filters (time range, max results, content format, auto-parameters).
6. **Run the agent**
   - Enter a goal (e.g., “Find running shoes on Amazon”).
   - Adjust search defaults if needed.
   - Click **Start Agent**. Real-time logs stream in the new *Event Log* section showing planner/executor/tool traffic.
   - Use **Stop** to halt (clears the goal and stops the overlay guidance) or **Reset** to fully clear history/logs.

## Repo Layout (key files)

- `background.js` – Service worker orchestrating start/stop/reset, content script reinjection, log storage, and navigation events.
- `content-script.js` – Maintains the overlay UI, handles DOM snapshots, MutationObserver, and message routing.
- `overlay.js` + `styles/overlay.css` – Shadow DOM overlay components: persistent pulse, long-lived highlight, tooltips.
- `dom-snapshot.js` – Element discovery, ranking, and registry management with mutation tracking.
- `agent/` – Planner/executor loop (`orchestrator.js`), rate limiter with smart model fallback, tool definitions/validators, memory persistence.
- `popup/` – Popup UI, API key storage, chat/search widgets, agent control panel, and live event log rendering.
- `prompts/` – System prompts and JSON schemas fed to Gemini models.

## Development Notes

- Commands/messages are routed via `chrome.runtime` message passing; check the background service worker console for agent logs prefixed with `[WebGuideAI][Agent]`.
- The popup’s *Event Log* mirrors those logs in real-time using the new `wga-agent-log` broadcast events.
- Rate limiter (`agent/rateLimiter.js`) detects 429/“too many requests” responses and cycles through configured models before surfacing an error.
- Tests: `node tests/rateLimiter.smoke.mjs` runs a quick sanity check on the rate limiter model rotation.

## Contributing

- Fork & branch from `main` for feature work.
- Keep directory-level READMEs updated when functionality changes.
- Prefer `rg` for search and adhere to the existing logging pattern (`[WebGuideAI][…]`).