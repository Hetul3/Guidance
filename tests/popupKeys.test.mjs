import { test } from 'node:test';
import assert from 'node:assert/strict';

const MASK = (value) => {
  if (!value) return '';
  const masked = '*'.repeat(Math.max(4, value.length - 4));
  return `${masked}${value.slice(-4)}`;
};

class ElementStub {
  constructor(id = null, tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.type = 'text';
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.disabled = false;
    this._listeners = Object.create(null);
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
  }

  emit(event, detail) {
    const handlers = this._listeners[event] || [];
    return Promise.all(handlers.map((handler) => handler({ detail })));
  }

  focus() {
    this.focused = true;
  }

  select() {
    this.selected = true;
  }

  appendChild(child) {
    this.children.push(child);
  }

  prepend(child) {
    this.children.unshift(child);
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  get innerHTML() {
    return this.children.length ? '[children]' : '';
  }

  set innerHTML(_) {
    this.children = [];
  }
}

const createEnvironment = () => {
  const elements = new Map();
  const stored = {};

  const createElementForId = (id) => {
    const el = new ElementStub(id);
    switch (id) {
      case 'api-keys-card':
        el.hidden = true;
        break;
      case 'close-gemini-key':
      case 'close-tavily-key':
        el.hidden = true;
        break;
      case 'manage-keys':
        el.textContent = 'Manage API Keys';
        break;
      default:
        break;
    }
    return el;
  };

  global.document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElementForId(id));
      }
      return elements.get(id);
    },
    createElement(tag) {
      return new ElementStub(null, tag);
    }
  };

  global.chrome = {
    runtime: {
      _listener: null,
      sendMessage(payload, callback) {
        const responses = {
          'wga-agent-status': { ok: true, status: { status: 'idle' } },
          'wga-agent-get-logs': { ok: true, logs: [] },
          'wga-agent-clear-log': { ok: true },
          'wga-agent-stop': { ok: true },
          'wga-agent-reset': { ok: true },
          'wga-agent-start': { ok: true }
        };
        const response = responses[payload.type] ?? { ok: true };
        callback?.(response);
      },
      onMessage: {
        addListener(handler) {
          chrome.runtime._listener = handler;
        }
      }
    },
    tabs: {
      async query() {
        return [{ id: 1, url: 'https://example.com' }];
      }
    },
    storage: {
      local: {
        async get(keys) {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach((key) => {
              if (key in stored) {
                result[key] = stored[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (keys in stored) {
              result[keys] = stored[keys];
            }
          } else if (keys && typeof keys === 'object') {
            Object.keys(keys).forEach((key) => {
              if (key in stored) {
                result[key] = stored[key];
              }
            });
          }
          return result;
        },
        async set(data) {
          Object.assign(stored, data);
        }
      }
    }
  };

  return { elements, get: (id) => elements.get(id), stored };
};

const setupPopup = async () => {
  const env = createEnvironment();
  const moduleUrl = new URL('../webguide-ai/popup/popup.js', import.meta.url);
  moduleUrl.searchParams.set('t', Date.now().toString());
  await import(moduleUrl.href);
  return env;
};

const triggerRuntimeMessage = (message) => {
  chrome.runtime._listener?.(message, null, () => {});
};

const click = async (element) => {
  await element?.emit('click');
};

const expectHidden = (element, hidden) => {
  assert.equal(element.hidden, hidden);
};

const expectValueMasked = (input, raw) => {
  assert.equal(input.type, 'password');
  assert.equal(input.value, MASK(raw));
};

const expectValuePlain = (input, raw) => {
  assert.equal(input.type, 'text');
  assert.equal(input.value, raw);
};

await test('Manage button toggles API configuration card and close hides it', async () => {
  const env = await setupPopup();
  const manageButton = env.get('manage-keys');
  const card = env.get('api-keys-card');
  expectHidden(card, true);

  await click(manageButton);
  expectHidden(card, false);
  assert.equal(manageButton.textContent, 'Hide API Keys');

  const closeGemini = env.get('close-gemini-key');
  await click(closeGemini);
  expectHidden(card, true);
  assert.equal(manageButton.textContent, 'Manage API Keys');
});

await test('Gemini key save masks value and toggle shows it', async () => {
  const env = await setupPopup();
  const manageButton = env.get('manage-keys');
  await click(manageButton);

  const input = env.get('gemini-api-key');
  input.value = 'abc12345';
  await click(env.get('save-api-key'));
  expectValueMasked(input, 'abc12345');

  const toggle = env.get('gemini-toggle-mask');
  await click(toggle);
  expectValuePlain(input, 'abc12345');

  await click(toggle);
  expectValueMasked(input, 'abc12345');
});

await test('Runtime error reveals Gemini key input automatically', async () => {
  const env = await setupPopup();
  const card = env.get('api-keys-card');
  expectHidden(card, true);

  triggerRuntimeMessage({ type: 'wga-agent-log', log: { id: '1', stage: 'planner.error', error: 'Gemini API key is missing.' } });
  expectHidden(card, false);
  const geminiStatus = env.get('api-key-status');
  assert.equal(geminiStatus.hidden, false);
  const geminiInput = env.get('gemini-api-key');
  assert.equal(geminiInput.focused, true);
});

await test('Tavily key save masks and toggle works', async () => {
  const env = await setupPopup();
  const manageButton = env.get('manage-keys');
  await click(manageButton);

  const tavInput = env.get('tavily-api-key');
  tavInput.value = 'tavkey9876';
  await click(env.get('save-tavily-key'));
  expectValueMasked(tavInput, 'tavkey9876');

  const toggle = env.get('tavily-toggle-mask');
  await click(toggle);
  expectValuePlain(tavInput, 'tavkey9876');

  await click(toggle);
  expectValueMasked(tavInput, 'tavkey9876');
});

await test('Close buttons hide API sections while manage card remains', async () => {
  const env = await setupPopup();
  const manageButton = env.get('manage-keys');
  await click(manageButton);

  const card = env.get('api-keys-card');
  expectHidden(card, false);

  const closeTavily = env.get('close-tavily-key');
  await click(closeTavily);
  expectHidden(card, true);
  assert.equal(manageButton.textContent, 'Manage API Keys');
});
