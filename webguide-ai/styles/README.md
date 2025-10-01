# Styles

Shared CSS resources for injected overlays and future UI elements.

## Files
- `overlay.css` — Styles the fixed overlay banner and Shadow DOM visuals (pulse, highlight, tooltip) using sequentially-triggered triple pulses with reduced radius.

## Notes
- Styles are exposed via `web_accessible_resources` in `manifest.json`, loaded inside the overlay Shadow DOM, and reused by the legacy banner.
- Pulses rely on a base class plus an `--animating` modifier toggled via `requestAnimationFrame` to avoid animation hitching.
