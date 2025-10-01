(function (global) {
  function highlightAll() {
    document.querySelectorAll('pre code').forEach((block) => {
      block.classList.add('hljs');
    });
  }

  global.hljs = {
    highlightAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
