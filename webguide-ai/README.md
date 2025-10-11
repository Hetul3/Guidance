# WebGuide AI

WebGuide AI is a Chrome extension that overlays lightweight automation tooling on top of complex web apps so you can ask questions, highlight UI, and get step-by-step help without leaving the page.

## Features
- **Agent-first popup** – A single control surface to launch/stop/reset runs and monitor a live Event Log streaming planner/executor/tool activity.
- **Collapsible API keys** – Gemini & Tavily key sections stay hidden until you request them or an auth error is detected, each with show/hide toggle + dismiss button.
- **DOM snapshot inventory** – Collect a rich, structured map of clickable elements (raw + LLM-friendly views) with contextual labels, visibility flags, MutationObserver versioning, and a global registry for ID lookups.
- **Persistent visual guidance** – Continuous pulse rings and longer-lived highlights keep the referenced UI element obvious until you navigate away.
- **Agent orchestration** – A planner/executor loop (Gemini) coordinates Tavily, DOM snapshots, and overlay guidance, persisting history across navigations while automatically rotating Gemini models on rate-limit errors.

Everything runs locally inside Chrome—no server required. Keys and results are stored in `chrome.storage.local` only.

## Getting Started

### Prerequisites
- Chrome 114 or later (or any Chromium-based browser with Manifest V3 support).
- Gemini API key (obtain via Google AI Studio).

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/webguide-ai.git
   cd webguide-ai
   ```
2. (Optional) Copy the environment template if you use local tooling:
   ```bash
   cp .env_example .env
   ```
   > The extension itself does **not** read `.env`; Gemini/Tavily keys are entered via the popup.
3. Load the extension in Chrome:
   - Open `chrome://extensions`.
   - Toggle **Developer mode** on.
   - Click **Load unpacked** and select the `webguide-ai` directory.

### Usage
1. Navigate to any `http(s)` page.
2. Click the WebGuide AI toolbar icon to open the popup.
3. **Manage API keys**
   - Keys are hidden by default. Click **Manage API Keys** to reveal the configuration card.
   - Paste your Gemini key (required) and optional Tavily key. Each section has *Show/Hide* and ✕ controls. Keys persist in `chrome.storage.local`.
   - If an agent call fails due to missing/invalid keys the card auto-opens and focuses the relevant field.
4. **Run the agent**
   - Enter your goal in the **Agent Console** and tweak search defaults if needed.
   - Click **Start Agent**. A live Event Log streams planner/executor/tool events, while the overlay highlights targets with persistent pulse/highlight cues.
   - **Stop** halts the run and clears the goal. **Reset** wipes logs/history and unlocks the Start button for a fresh goal.

### Development Notes
- `popup.js` handles the streamlined UI (agent controls, event log, collapsible API key management, auth error surfacing).
- `llm.js` wraps Gemini 2.0 Flash with deterministic settings (temperature 0) and typed errors for missing/invalid API keys.
- `tavily.js` wraps Tavily's search endpoint with explicit parameters (`searchDepth: "advanced"`, controllable `maxResults`/`chunksPerSource`, selectable `includeRawContent` format, `autoParameters` toggle) and normalises snippet output while surfacing typed errors for missing/invalid keys.
- `background.js` tracks tabs that have the overlay enabled, persists up to 50 scan log entries (reason, counts, errors), and rehydrates the overlay state on navigation so history survives full reloads.
- `agent/` implements the end-to-end workflow: `orchestrator.js` (planner/executor loop), `memory.js` (chrome.storage persistence), `rateLimiter.js` (per-model RPM buckets and fallbacks), `tools.js`/`validators.js` (Gemini tool schemas), and `grounding.js` (DOM candidate ranking).
- `prompts/` holds system messages and JSON tool schemas consumed by the agent.
- `vendor/` contains trimmed third-party bundles (marked, DOMPurify, highlight.js) referenced by the popup and overlay.
- `dom-snapshot.js` builds a rich element inventory (raw + filtered LLM view) and stores a live registry map for subsequent automation.
- `styles/chat.css` / `styles/highlight.css` define the Markdown and code presentation; `vendor/marked-lite.js` and `vendor/dompurify-lite.js` keep parsing/sanitisation self-contained.

### Manual Testing Checklist
- Start the agent, confirm it requests a DOM snapshot, optionally uses Tavily once, and highlights the suggested control with continuous pulse/highlight cues.
- Trigger SPA navigation or open a modal; the overlay persists and the agent resumes after logging the change.
- Stop halts guidance and clears the goal; Reset wipes event logs/history and unlocks another run.
- Manage API Keys button shows/collapses the configuration card; missing/invalid keys auto-open the appropriate section and focus the input. Show/Hide toggles reveal the raw key, ✕ hides the section once updated.
- Event Log streams planner/executor/tool actions in real time and can be cleared via the popup button.
- DOM snapshot logs remain accessible via `window.WebGuideAI.elementRegistry`.

### Known Limitations
- Gemini/Tavily usage depends on user-provided API keys and browser network availability.
- Highly dynamic pages (heavy iframes/SaaS consoles) may not expose enough DOM metadata for reliable grounding.
- The agent never auto-clicks; users must follow the visual guidance to progress.
- Overlay persistence:
  - When the overlay panel is open, every navigation/SPA mutation is logged and persisted to `background.js`; full page reloads reinject the panel with history intact.
  - Clicking the panel’s **Clear** chip wipes both the visible log and the stored history; the panel only stays hidden across navigations if the user closes it with “×”.

## License
MIT © 2024 WebGuide AI contributors
