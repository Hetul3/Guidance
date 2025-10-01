# WebGuide AI

WebGuide AI is a Chrome extension that overlays lightweight automation tooling on top of complex web apps so you can ask questions, highlight UI, and get step-by-step help without leaving the page.

## Features
- **Injectable overlay tools** – Activate an overlay banner, visual highlight/pulse animations, and snapshot the DOM structure of the active tab for downstream automation.
- **Gemini test chat** – Provide a Gemini API key, send prompts directly from the popup, and receive fully rendered Markdown responses with syntax-highlighted code blocks. Missing/invalid keys surface graceful UI prompts instead of console errors.
- **DOM snapshot inventory** – Collect a rich, structured map of clickable elements (raw + LLM-friendly views) with contextual labels, visibility flags, MutationObserver versioning, and a global registry for ID lookups.

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
   > The extension itself does **not** read `.env`; Gemini keys are entered via the popup.
3. Load the extension in Chrome:
   - Open `chrome://extensions`.
   - Toggle **Developer mode** on.
   - Click **Load unpacked** and select the `webguide-ai` directory.

### Usage
1. Navigate to any `http(s)` page.
2. Click the WebGuide AI extension icon to open the popup.
3. Use the **Quick Actions** buttons to:
   - **Activate Overlay** – Inject the banner and overlay module.
   - **Run Overlay Demo** – Pulse + highlight example elements.
   - **Run DOM Snapshot** – Log raw/LLM element arrays to DevTools; registry is available via `window.WebGuideAI.elementRegistry`.
4. Configure Gemini:
   - Enter your Gemini API key in the **Gemini Access** card, click **Save Key**.
   - Keys persist in `chrome.storage.local`; use a dedicated key for safety.
5. Test Gemini chat:
   - Type any prompt in the chat textarea, press **Send** (or Ctrl/⌘+Enter).
   - Responses render as sanitised Markdown with syntax-highlighted code blocks. Errors are surfaced inline with actionable messaging.

### Development Notes
- `popup.js` handles UI orchestration (DOM snapshot messaging, overlay injection, API key management, Gemini chat).
- `llm.js` wraps Gemini 2.0 Flash with deterministic settings (temperature 0) and typed errors for missing/invalid API keys.
- `dom-snapshot.js` builds a rich element inventory (raw + filtered LLM view) and stores a live registry map for subsequent automation.
- `styles/chat.css` / `styles/highlight.css` define the Markdown and code presentation; `vendor/marked-lite.js` and `vendor/dompurify-lite.js` keep parsing/sanitisation self-contained.

### Manual Testing Checklist
- Overlay activation and demo buttons work on arbitrary pages.
- DOM snapshot logs raw+LLM arrays and allows ID lookup via `window.WebGuideAI.elementRegistry`.
- Gemini chat handles bold/italic/strikethrough, lists, tables, task lists, blockquotes, code blocks, links, and images without leaking raw Markdown.
- Invalid/missing keys trigger the inline prompt and do not crash the popup.

## License
MIT © 2024 WebGuide AI contributors
