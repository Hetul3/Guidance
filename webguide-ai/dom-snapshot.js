const ELEMENT_ID_ATTR = 'data-wga-clickable-id';
const CLICKABLE_SELECTORS = [
  'button',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="image"]',
  '[role="button"]',
  '[onclick]',
  '[tabindex="0"]'
];

let elementIdCounter = 0;
let mutationObserver = null;
let mutationVersion = 0;
const elementRegistry = new Map();
const MAX_LLM_RESULTS = 50;

const LABEL_LOOKUP_SELECTOR = [
  'label',
  'legend',
  'summary',
  'caption',
  'dt',
  '.label',
  '.field-label',
  '.form-label',
  '.control-label',
  '.form__label',
  '.govuk-label',
  '.usa-label',
  '.slds-form-element__label',
  '.ant-form-item-label',
  'strong',
  'b',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
].join(', ');

const escapeAttributeValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
};

const assignElementId = (element) => {
  if (!element) {
    return null;
  }

  let existingId = element.getAttribute(ELEMENT_ID_ATTR);
  if (existingId) {
    return existingId;
  }

  elementIdCounter += 1;
  const newId = `el${elementIdCounter}`;
  element.setAttribute(ELEMENT_ID_ATTR, newId);
  return newId;
};

const truncateString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }

  if (compact.length > 100) {
    return `${compact.slice(0, 100).trim()}…`;
  }

  return compact;
};

const normaliseText = (element) => {
  if (!element) {
    return '';
  }

  let text = '';

  if (element instanceof HTMLInputElement) {
    text = element.value || element.getAttribute('value') || '';
  } else {
    text = element.innerText || element.textContent || '';
  }

  return truncateString(text);
};

const isMeaningfulText = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const cleaned = value.trim();
  if (cleaned.length < 3) {
    return false;
  }

  return !/^[-_,.;:!?\s]+$/.test(cleaned);
};

const getLabelByForAttribute = (element) => {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  const elementId = element.getAttribute('id');
  if (!elementId) {
    return '';
  }

  const selector = `label[for="${escapeAttributeValue(elementId)}"]`;
  const label = document.querySelector(selector);
  if (!label) {
    return '';
  }

  return normaliseText(label);
};

const getLabelFromParent = (element) => {
  let parent = element instanceof HTMLElement ? element.parentElement : null;

  while (parent) {
    if (parent.tagName && parent.tagName.toLowerCase() === 'label') {
      return normaliseText(parent);
    }

    parent = parent.parentElement;
  }

  return '';
};

const getSiblingText = (element) => {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  const parent = element.parentElement;
  if (!parent) {
    return '';
  }

  const candidateNodes = [];

  let previous = element.previousElementSibling;
  while (previous && candidateNodes.length < 3) {
    candidateNodes.push(previous);
    previous = previous.previousElementSibling;
  }

  let next = element.nextElementSibling;
  while (next && candidateNodes.length < 6) {
    candidateNodes.push(next);
    next = next.nextElementSibling;
  }

  for (const node of candidateNodes) {
    const text = normaliseText(node);
    if (text) {
      return text;
    }
  }

  const siblingTextNode = (node) => {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return '';
    }

    return truncateString(node.textContent || '');
  };

  let prevNode = element.previousSibling;
  while (prevNode) {
    const text = siblingTextNode(prevNode);
    if (text) {
      return text;
    }
    prevNode = prevNode.previousSibling;
  }

  let nextNode = element.nextSibling;
  while (nextNode) {
    const text = siblingTextNode(nextNode);
    if (text) {
      return text;
    }
    nextNode = nextNode.nextSibling;
  }

  return '';
};

const collectContainerText = (container, target) => {
  if (!(container instanceof HTMLElement)) {
    return '';
  }

  const texts = [];

  container.childNodes.forEach((node) => {
    if (node === target) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const elementNode = node;
      if (elementNode.contains(target)) {
        return;
      }

      if (elementNode.matches && elementNode.matches(LABEL_LOOKUP_SELECTOR)) {
        const labelText = normaliseText(elementNode);
        if (labelText) {
          texts.push(labelText);
        }
        return;
      }

      if (elementNode.matches && elementNode.matches('span, p, div, strong, b, em')) {
        const text = normaliseText(elementNode);
        if (text) {
          texts.push(text);
        }
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = truncateString(node.textContent || '');
      if (text) {
        texts.push(text);
      }
    }
  });

  return texts.find(isMeaningfulText) || '';
};

const getAncestorContext = (element, maxDepth = 2) => {
  let current = element instanceof HTMLElement ? element.parentElement : null;
  let depth = 0;

  while (current && depth < maxDepth) {
    const directLabel = collectContainerText(current, element);
    if (directLabel) {
      return directLabel;
    }

    const parentText = truncateString(current.textContent || '');
    if (isMeaningfulText(parentText) && parentText.length <= 100) {
      return parentText;
    }

    element = current;
    current = current.parentElement;
    depth += 1;
  }

  return '';
};

const getAssociatedLabel = (element) => {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  if (element.tagName.toLowerCase() === 'input') {
    const explicit = getLabelByForAttribute(element);
    if (explicit) {
      return explicit;
    }

    const fromParent = getLabelFromParent(element);
    if (fromParent) {
      return fromParent;
    }
  }

  const sibling = getSiblingText(element);
  return sibling;
};

const gatherAssociations = (element) => {
  const associations = {
    label: '',
    context: ''
  };

  const explicitLabel = element instanceof HTMLElement ? getLabelByForAttribute(element) : '';
  const parentLabel = element instanceof HTMLElement ? getLabelFromParent(element) : '';
  const siblingLabel = getSiblingText(element);
  const ancestorContext = getAncestorContext(element);

  const labelCandidates = [explicitLabel, parentLabel, siblingLabel].map(truncateString).filter(isMeaningfulText);
  let label = labelCandidates.find(Boolean) || '';
  let context = '';

  if (!label && isMeaningfulText(ancestorContext)) {
    label = ancestorContext;
  } else if (ancestorContext && ancestorContext !== label) {
    context = ancestorContext;
  }

  associations.label = label;
  associations.context = context;

  return associations;
};

const getBoundingBox = (element) => {
  try {
    const rect = element.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  } catch (_error) {
    return null;
  }
};

const isDisplayed = (element, computedStyle) => {
  if (!computedStyle) {
    return true;
  }

  if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
    return false;
  }

  if (computedStyle.opacity === '0') {
    return false;
  }

  if (element instanceof HTMLElement && element.hasAttribute('hidden')) {
    return false;
  }

  return true;
};

const isInViewport = (rect) => {
  if (!rect) {
    return false;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

  return (
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= viewportHeight &&
    rect.left <= viewportWidth
  );
};

const getInputType = (element) => {
  if (element instanceof HTMLInputElement) {
    return (element.getAttribute('type') || 'text').toLowerCase();
  }

  return null;
};

const isPrimaryAction = (tag, role, inputType, href) => {
  if (tag === 'button') {
    return true;
  }

  if (role === 'button' || role === 'link') {
    return true;
  }

  if (tag === 'a' && href) {
    return true;
  }

  if (tag === 'input') {
    if (!inputType) {
      return false;
    }
    return ['submit', 'button', 'reset', 'image'].includes(inputType);
  }

  return false;
};

const hasMeaningfulContent = (data) => {
  if (!data) {
    return false;
  }

  return [
    data.text,
    data.title,
    data.ariaLabel,
    data.placeholder,
    data.associatedLabel,
    data.associatedContext
  ].some(isMeaningfulText);
};

const computePriorityScore = (data) => {
  let score = 0;

  if (data.visible) {
    score += 120;
  }

  if (data.meaningful) {
    score += 80;
  }

  if (data.primary) {
    score += 60;
  }

  if (isMeaningfulText(data.ariaLabel)) {
    score += 20;
  }

  if (isMeaningfulText(data.associatedLabel)) {
    score += 20;
  }

  if (isMeaningfulText(data.placeholder)) {
    score += 15;
  }

  if (isMeaningfulText(data.title)) {
    score += 10;
  }

  if (data.href) {
    score += 10;
  }

  const positionBonus = data.absTop != null ? Math.max(0, 60 - data.absTop / 20) : 0;
  score += positionBonus;

  if (!data.visible && data.needsScroll) {
    score -= 10;
  }

  return score;
};

const filterLlmResults = (rawResults, llmResults) => {
  if (rawResults.length <= 200) {
    return llmResults;
  }

  const llmMap = new Map(llmResults.map((item) => [item.id, item]));

  const sortedRaw = [...rawResults].sort((a, b) => {
    if (a.visible !== b.visible) {
      return a.visible ? -1 : 1;
    }

    if (a.meaningful !== b.meaningful) {
      return a.meaningful ? -1 : 1;
    }

    if (a.primary !== b.primary) {
      return a.primary ? -1 : 1;
    }

    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    const aTop = a.absTop ?? Number.POSITIVE_INFINITY;
    const bTop = b.absTop ?? Number.POSITIVE_INFINITY;
    if (aTop !== bTop) {
      return aTop - bTop;
    }

    return a.id.localeCompare(b.id);
  });

  const limit = 50;
  const selected = [];

  for (const raw of sortedRaw) {
    const llmEntry = llmMap.get(raw.id);
    if (!llmEntry) {
      continue;
    }

    selected.push(llmEntry);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
};

const considerElement = (element, includeHidden, seen, rawResults, llmResults, providedStyle) => {
  if (!(element instanceof Element)) {
    return;
  }

  if (seen.has(element)) {
    return;
  }

  const computedStyle = providedStyle || window.getComputedStyle(element);
  const displayed = isDisplayed(element, computedStyle);

  if (!includeHidden && !displayed) {
    return;
  }

  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') {
      return;
    }
  }

  const rect = getBoundingBox(element);
  const hasSize = rect && rect.width > 0 && rect.height > 0;

  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  const title = element.getAttribute('title');
  const alt = element.getAttribute('alt');
  const role = element.getAttribute('role');

  const placeholderValue = element instanceof HTMLInputElement
    ? element.placeholder || element.getAttribute('placeholder')
    : null;

  let describedText = '';
  if (ariaLabelledBy) {
    const labelledEl = document.getElementById(ariaLabelledBy);
    if (labelledEl) {
      describedText = normaliseText(labelledEl);
    }
  }

  const text = normaliseText(element);
  const associations = gatherAssociations(element);
  const associatedLabel = truncateString(associations.label || '');
  const associatedContext = truncateString(associations.context || '');
  const ariaLabelledText = truncateString(describedText || '');
  const placeholderText = truncateString(placeholderValue || '');
  const ariaLabelText = truncateString(ariaLabel || '');
  const titleText = truncateString(title || '');
  const altText = truncateString(alt || '');

  const usefulText = text || describedText || ariaLabelText || titleText || altText || placeholderText || associatedLabel || associatedContext;

  if (!usefulText && !element.hasAttribute('href')) {
    return;
  }

  const id = assignElementId(element);
  seen.add(element);

  const href = element.getAttribute('href') || null;
  const inputType = getInputType(element);

  const rawData = {
    id,
    tag: element.tagName.toLowerCase(),
    text,
    title: titleText || null,
    ariaLabel: ariaLabelText || null,
    placeholder: placeholderText || null,
    associatedLabel: associatedLabel || (ariaLabelledText || null),
    associatedContext: associatedContext || null,
    href,
    classes: Array.from(element.classList || []),
    onclick: typeof element.onclick === 'function' || element.hasAttribute('onclick'),
    bbox: rect,
    absTop: rect ? rect.top + window.scrollY : null,
    absLeft: rect ? rect.left + window.scrollX : null,
    visible: displayed && hasSize && isInViewport(rect),
    needsScroll: displayed && hasSize && !isInViewport(rect),
    mutationVersion,
    role: role || null,
    inputType
  };

  rawData.primary = isPrimaryAction(rawData.tag, role, inputType, href);
  rawData.meaningful = hasMeaningfulContent(rawData);
  rawData.priority = computePriorityScore(rawData);

  rawResults.push(rawData);
  elementRegistry.set(id, element);

  const llmData = {
    id,
    tag: rawData.tag,
    text: rawData.text,
    title: rawData.title,
    ariaLabel: rawData.ariaLabel,
    placeholder: rawData.placeholder,
    associatedLabel: rawData.associatedLabel,
    associatedContext: rawData.associatedContext,
    href
  };

  llmResults.push(llmData);
};

const ensureMutationObserver = () => {
  if (mutationObserver || typeof MutationObserver === 'undefined') {
    return;
  }

  const target = document.body || document.documentElement;
  if (!target) {
    return;
  }

  mutationObserver = new MutationObserver(() => {
    mutationVersion += 1;
  });

  mutationObserver.observe(target, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'href', 'role', 'tabindex', 'onclick', 'aria-label', 'title']
  });
};

export function collectClickableElements(includeHidden = false) {
  ensureMutationObserver();

  elementRegistry.clear();

  const rawResults = [];
  const llmResults = [];
  const seen = new Set();

  CLICKABLE_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      considerElement(element, includeHidden, seen, rawResults, llmResults);
    });
  });

  const pointerScope = document.body ? document.body : document.documentElement;
  if (pointerScope) {
    pointerScope.querySelectorAll('*').forEach((element) => {
      if (seen.has(element)) {
        return;
      }

      const computedStyle = window.getComputedStyle(element);
      if (computedStyle.cursor === 'pointer') {
        considerElement(element, includeHidden, seen, rawResults, llmResults, computedStyle);
      }
    });
  }

  const filteredLlm = filterLlmResults(rawResults, llmResults).slice(0, MAX_LLM_RESULTS);

  return {
    raw: rawResults,
    llm: filteredLlm,
    mutationVersion,
    registry: elementRegistry
  };
}

if (typeof window !== 'undefined') {
  window.WebGuideAI = {
    ...(window.WebGuideAI || {}),
    collectClickableElements,
    elementRegistry
  };
}

export const MAX_CLICKABLE_RESULTS = MAX_LLM_RESULTS;

export function getLLMSnapshot(includeHidden = false) {
  const snapshot = collectClickableElements(includeHidden);
  return {
    llm: snapshot.llm,
    rawCount: snapshot.raw.length,
    llmCount: snapshot.llm.length,
    mutationVersion,
    registry: snapshot.registry
  };
}
