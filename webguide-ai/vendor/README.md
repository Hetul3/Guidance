# Vendor Bundles

Pre-bundled third-party libraries shipped with the extension so content scripts and the popup can load them without network access or runtime bundling.

## Files
- `dompurify-lite.js` – Lightweight DOMPurify build for sanitising Markdown/HTML returned by the LLM or Tavily.
- `highlight-lite.js` – Custom highlight.js build that powers syntax highlighting inside the popup’s rendered responses.
- `marked-lite.js` / `marked.min.js` – Trimmed Marked builds used to parse Markdown responses within the popup/overlay.

## Notes
- These bundles are referenced via `chrome.runtime.getURL(...)` from popup scripts; keep filenames stable unless you update the import paths.
- If upgrading, prefer the official CDN builds and strip unused languages/features to keep the extension size small.
