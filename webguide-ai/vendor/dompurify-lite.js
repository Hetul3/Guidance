(function (global) {
  function sanitize(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const dangerous = ['script', 'style', 'iframe', 'object', 'embed'];
    template.content.querySelectorAll(dangerous.join(',')).forEach((node) => node.remove());
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
    const disallowedAttrs = [/^on/i, /style/i];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      [...el.attributes].forEach((attr) => {
        if (disallowedAttrs.some((test) => test.test(attr.name))) {
          el.removeAttribute(attr.name);
        }
        if (/^(javascript:|data:text\/html)/i.test(attr.value || '')) {
          el.removeAttribute(attr.name);
        }
      });
    }
    return template.innerHTML;
  }

  global.DOMPurify = {
    sanitize
  };
})(typeof window !== 'undefined' ? window : globalThis);
