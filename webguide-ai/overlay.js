const OVERLAY_HOST_ID = 'webguide-ai-visual-overlay-host';
const CONTAINER_CLASS = 'wga-overlay-root';
const STYLE_ATTRIBUTE = 'data-wga-overlay-style';

const getBoundingBox = (target) => {
  if (!target) {
    return null;
  }

  if (target instanceof Element) {
    const rect = target.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }
    return rect;
  }

  const maybeBox = target;
  if (typeof maybeBox === 'object') {
    const { top, left, width, height } = maybeBox;
    if ([top, left, width, height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return { top, left, width, height, right: left + width, bottom: top + height }; // mimic DOMRectSubset
    }
  }

  return null;
};

const ensureOverlayEnvironment = () => {
  let host = document.getElementById(OVERLAY_HOST_ID);

  if (!host) {
    host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';
    host.style.overflow = 'visible';
    document.documentElement.appendChild(host);
  }

  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: 'open' });
  }

  if (!shadow.querySelector(`link[${STYLE_ATTRIBUTE}]`)) {
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('styles/overlay.css');
    styleLink.setAttribute(STYLE_ATTRIBUTE, 'true');
    shadow.appendChild(styleLink);
  }

  let container = shadow.querySelector(`.${CONTAINER_CLASS}`);
  if (!container) {
    container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    shadow.appendChild(container);
  }

  return { host, shadow, container };
};

const createPulse = (rect, container) => {
  const baseSize = Math.max(rect.width, rect.height);
  const diameter = Math.max(Math.min(baseSize * 0.85, 120), 28);
  const top = rect.top + rect.height / 2 - diameter / 2;
  const left = rect.left + rect.width / 2 - diameter / 2;

  const spawnPulse = () => {
    const pulse = document.createElement('div');
    pulse.className = 'wga-pulse';
    pulse.style.width = `${diameter}px`;
    pulse.style.height = `${diameter}px`;
    pulse.style.top = `${top}px`;
    pulse.style.left = `${left}px`;

    pulse.addEventListener('animationend', () => {
      pulse.remove();
    });

    container.appendChild(pulse);

    requestAnimationFrame(() => {
      pulse.classList.add('wga-pulse--animating');
    });
  };

  spawnPulse();
  setTimeout(spawnPulse, 180);
  setTimeout(spawnPulse, 360);

  return null;
};

const createHighlight = (rect, message, container) => {
  const highlight = document.createElement('div');
  highlight.className = 'wga-highlight';
  highlight.style.top = `${rect.top - 4}px`;
  highlight.style.left = `${rect.left - 4}px`;
  highlight.style.width = `${rect.width + 8}px`;
  highlight.style.height = `${rect.height + 8}px`;

  container.appendChild(highlight);

  let tooltip;
  if (message) {
    tooltip = document.createElement('div');
    tooltip.className = 'wga-tooltip';
    tooltip.textContent = message;

    const centerX = rect.left + rect.width / 2;
    const above = rect.top >= 60;

    tooltip.dataset.position = above ? 'above' : 'below';
    tooltip.style.left = `${centerX}px`;
    tooltip.style.top = above ? `${rect.top - 12}px` : `${rect.bottom + 12}px`;

    container.appendChild(tooltip);
  }

  setTimeout(() => {
    highlight.remove();
    if (tooltip) {
      tooltip.remove();
    }
  }, 3000);

  return { highlight, tooltip };
};

export const pulseAtElement = (target) => {
  const rect = getBoundingBox(target);
  if (!rect) {
    return null;
  }

  const { container } = ensureOverlayEnvironment();
  return createPulse(rect, container);
};

export const highlightElement = (target, message = '') => {
  const rect = getBoundingBox(target);
  if (!rect) {
    return null;
  }

  const { container } = ensureOverlayEnvironment();
  return createHighlight(rect, message, container);
};

export const ensureOverlayRoot = () => {
  const { host, shadow, container } = ensureOverlayEnvironment();
  return { host, shadowRoot: shadow, container };
};
