const listeners = new Set();

export function subscribe(listener) {
  if (typeof listener === 'function') {
    listeners.add(listener);
  }
  return () => listeners.delete(listener);
}

export function emit(event) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn('[WebGuideAI][Interrupts] Listener failed:', error);
    }
  });
}
