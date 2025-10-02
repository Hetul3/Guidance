# agents.md — WebGuide AI Project Specification

## Project Overview  
**Name**: WebGuide AI  
**Purpose**: Guide users through web applications (e.g. AWS Console) via chatbot + overlay instructions.  
**Core Value**: Minimize context switching, adapt to real UI changes, and provide visual cues.

## Key Features  
1. Chat interface to accept user questions.  
2. DOM snapshot of clickable elements (with metadata: id, tag, text, href, abs coords, visibility).  
3. LLM integration (Gemini API) with structured action responses.  
4. Web search integration (Brave Search) for real-time guidance.  
5. Overlay animations: highlight, pulse, tooltip.  
6. Scrolling guidance (up/down) when target is off-screen.  
7. Support for dynamically loaded elements (via MutationObserver).  
8. Caching free search results and LLM outputs to save quota.  
9. Module-based, testable components.  
10. Local-only usage (user provides keys, no backend dependency).

## Tech Stack  
- Chrome Extension (Manifest V3)  
- JavaScript / TypeScript  
- Shadow DOM + CSS animations for overlays  
- Gemini API (text + JSON)  
- Brave Search API wrapper  
- chrome.storage.local (config, cache)  
- Optional screenshot fallback using `chrome.tabs.captureVisibleTab`

## Directory Structure (Suggestion)  
webguide-ai/
manifest.json
background.js
content-script.js
overlay.js
chat-ui.js
dom-snapshot.js
search.js
llm.js
storage.js
utils.js
styles/
overlay.css
chat.css
chat.css
popup/
popup.html
popup.js
README.md
agents.md

## Current Implementation Status  
- Base Chrome extension scaffold in `webguide-ai/` with Manifest V3, background service worker, and popup registration.  
- Popup UI (`popup/popup.html`, `popup/popup.js`) renders a greeting and injects the active tab content script on demand.  
- `content-script.js` injects the persistent overlay panel, exposes messaging hooks, throttles DOM rescans, and records navigation/mutation history. The panel reopens automatically after navigations unless the user explicitly closes it with “×”, and logs are synchronised with the background service worker.  
- `styles/overlay.css` supplies both the legacy banner style and the Shadow DOM visuals for pulses, highlights, and tooltips.  
- Popup logic guards against unsupported schemes (e.g., `chrome://`) and surfaces status feedback in the UI.  
- `overlay.js` builds the Shadow DOM overlay system with reusable pulse and highlight utilities.  
- Popup UI offers separate controls for feature activation vs. overlay demonstrations to keep modules independently testable.  
- `dom-snapshot.js` provides the clickable-element inventory with MutationObserver-backed refresh tracking, returning both raw developer metadata and LLM-friendly semantic views, maintaining a live element registry for ID lookups, and prioritising high-value elements (≤50) for the LLM; content script logs snapshots on activation plus on-demand.  
- `storage.js` offers chrome.storage helpers for API key persistence and other configuration values.  
- `llm.js` wraps Gemini 2.0 Flash requests with stored API key access, deterministic configuration, and typed error handling for missing/invalid credentials.  
- `background.js` tracks which tabs have the overlay enabled, reinjects the content script on `webNavigation` events, and stores up to 50 scan log entries (reason, counts, errors) per tab for later replay.  
- Popup bundles Markdown rendering (`marked-lite.js`), sanitisation (`dompurify-lite.js`), and code highlighting (`highlight-lite.js`) to present Gemini and Tavily responses with full formatting inside the UI.  
- `tavily.js` implements the advanced Tavily search flow with adjustable parameters (time range, start/end dates, max results, chunk count, snippet format, auto-parameters), deterministic defaults, and robust key retry handling.  
- `vendor/` ships pre-bundled Marked, DOMPurify, and highlight.js builds; see its README for upgrade notes.

## Conventions & Rules  
- Every directory must include a README (or directory-level `agents.md`) that reflects its current responsibilities; update it whenever substantial changes land in that folder.  
- The LLM output schema from `llm.js` must always be valid JSON (no stray text).  
- If an element ID is invalid or missing, fallback safely (e.g. “retry”, “no-op”, or re-snapshot).  
- Use deterministic prompts (temperature = 0) for core logic.  
- Avoid sending full sensitive user data; filter DOM context for safety.  
- Cache external search and LLM results to reduce repeated calls.

## JSON Action Schema (for LLM wrapper)  
Example:
```json
{
  "steps": [
    { "action": "scroll", "direction": "down" },
    { "action": "highlight", "targetId": "el42", "message": "Click ‘Launch Instance’" }
  ]
}
```

## Development Phases  
Overlay module (pulse / highlight)  
DOM snapshot module  
LLM wrapper (basic prompt → JSON)  
Search wrapper (Brave API)  
Chat UI / messaging  
Integration and loop (snapshot → search → LLM → overlay)  
Testing scenarios (e.g. AWS EC2 workflow)  
Optimizations, error handling, fallback modes

## Notes & Future Enhancements  
Optional screenshot fallback for ambiguous cases  
More robust scroll / dynamically loaded content handling  
UI polish (chat styling, animations)  
Multi-step automation (support for tool chaining)

## Manual Testing Checklist  
- Overlay activation works on arbitrary `http(s)` pages; the panel should log an initial scan.  
- Navigate between pages (full reload): the overlay re-injects automatically with prior log entries intact and a new `navigation-completed` item.  
- Close the panel with “×”: it stays hidden across navigations until reactivated via the popup’s **Activate Overlay** button.  
- Use the panel’s **Clear** control to wipe history locally and in the background; new scans repopulate entries.  
- DOM snapshot logging works and element IDs remain accessible via `window.WebGuideAI.elementRegistry`.  
- Gemini chat renders Markdown responses safely; invalid keys prompt for re-entry without crashing the UI.  
- Tavily search respects advanced overrides (time range, start/end date, max results, chunk count, snippet format, auto-parameters) and surfaces clear error messaging for missing/invalid keys.  
