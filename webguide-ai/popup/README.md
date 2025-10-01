# Popup Module

Handles the action popup UI for WebGuide AI.

## Files
- `popup.html` — Minimal interface with activation controls, overlay demo trigger, DOM snapshot trigger, and status messaging.
- `popup.js` — Queries the active tab, validates the URL, injects the overlay/content script, and sends feature-specific test commands (overlay demo, DOM snapshot, future modules).

## Notes
- Injection is limited to `http(s)` tabs to avoid restricted pages like `chrome://`.
- Overlay demo remains optional; other feature tests can reuse the shared messaging channel without triggering overlay visuals.
- Demo button currently calls the overlay module, which spawns three sequential pulses to avoid flicker and adds a tooltip highlight.
- DOM snapshot button calls into the snapshot module and logs both raw developer metadata and compact LLM descriptors (filtered to ~50 high-priority items) to the page console, updating the popup status with element totals.
- Status text uses semantic `role="status"` for accessibility and inline messaging.
