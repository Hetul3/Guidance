(function (global) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (ch) => entityMap[ch]);
  }

  function parseInline(text) {
    let result = escapeHtml(text);
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    result = result.replace(/\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
    result = result.replace(/_(?!_)([^_]+)_(?!_)/g, '<em>$1</em>');
    result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return result;
  }

  function parseList(lines, i, ordered) {
    const items = [];
    let start = ordered ? Number(/^(\d+)/.exec(lines[i])[1]) || 1 : null;
    while (i < lines.length) {
      const line = lines[i];
      const match = ordered ? line.match(/^\s*(\d+)\.\s+(.*)$/) : line.match(/^\s*([-*+])\s+(.*)$/);
      if (!match) break;
      const raw = match[2];
      const task = raw.match(/^\[([ xX])\]\s*(.*)$/);
      let content = task ? task[2] : raw;
      const buffer = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s{2,}/)) {
        buffer.push(lines[i].replace(/^\s{2}/, ''));
        i++;
      }
      if (buffer.length) content += '\n' + buffer.join('\n');
      items.push({ content, task: !!task, checked: task ? task[1].toLowerCase() === 'x' : false });
    }
    return { index: i, html: buildList(items, ordered, start) };
  }

  function buildList(items, ordered, start) {
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    const body = items.map((item) => {
      const taskAttr = item.task ? ` class="task-list-item"` : '';
      const checkbox = item.task ? `<input type="checkbox" disabled ${item.checked ? 'checked' : ''} /> ` : '';
      return `<li${taskAttr}>${checkbox}${parseBlocks(item.content)}</li>`;
    }).join('');
    return `<${tag}${startAttr}>${body}</${tag}>`;
  }

  function parseTable(lines, i) {
    const header = lines[i].trim();
    const alignLine = lines[i + 1] ? lines[i + 1].trim() : '';
    if (!/\|/.test(header) || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*$/.test(alignLine)) {
      return null;
    }
    const headers = header.split('|').map((h) => parseInline(h.trim()))
      .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === ''));
    const aligns = alignLine.split('|').map((col) => {
      col = col.trim();
      if (!col) return null;
      const left = col.startsWith(':');
      const right = col.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return null;
    }).filter((_, idx) => idx < headers.length);
    const rows = [];
    i += 2;
    while (i < lines.length && /\|/.test(lines[i])) {
      const row = lines[i].split('|').map((c) => parseInline(c.trim()))
        .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === ''));
      if (row.length) rows.push(row);
      i++;
    }
    const headRow = headers.map((cell, idx) => {
      const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
      return `<th${align}>${cell}</th>`;
    }).join('');
    const bodyRows = rows.map((row) => '<tr>' + row.map((cell, idx) => {
      const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
      return `<td${align}>${cell}</td>`;
    }).join('') + '</tr>').join('');
    return { index: i, html: `<table><thead><tr>${headRow}</tr></thead><tbody>${bodyRows}</tbody></table>` };
  }

  function parseBlocks(text) {
    const lines = text.replace(/\r\n?|\r/g, '\n').split('\n');
    const parts = [];
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (/^```/.test(line)) {
        const lang = line.replace(/```\s*/, '').trim();
        const buffer = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          buffer.push(lines[i]);
          i++;
        }
        i++;
        const code = escapeHtml(buffer.join('\n'));
        parts.push(`<pre><code class="language-${lang}">${code}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        parts.push(`<h${level}>${parseInline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      if (/^\s*---+$/.test(line)) {
        parts.push('<hr />');
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const buffer = [line.replace(/^>\s?/, '')];
        i++;
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buffer.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        parts.push(`<blockquote>${parseBlocks(buffer.join('\n'))}</blockquote>`);
        continue;
      }

      if (/^\s{0,3}([-*+]\s+|\d+\.\s+)/.test(line)) {
        const ordered = /^\s{0,3}\d+\.\s+/.test(line);
        const listData = parseList(lines, i, ordered);
        parts.push(listData.html);
        i = listData.index;
        continue;
      }

      const tableData = parseTable(lines, i);
      if (tableData) {
        parts.push(tableData.html);
        i = tableData.index;
        continue;
      }

      const buffer = [line];
      i++;
      while (i < lines.length && lines[i] && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s{0,3}([-*+]\s+|\d+\.\s+)/.test(lines[i]) && !/^>\s?/.test(lines[i]) && lines[i].trim() !== '---' && !/\|/.test(lines[i])) {
        buffer.push(lines[i]);
        i++;
      }
      const paragraph = buffer.join(' ');
      parts.push(`<p>${parseInline(paragraph)}</p>`);
    }
    return parts.join('\n');
  }

  function markedParse(text) {
    return parseBlocks(text || '');
  }

  global.marked = {
    parse: markedParse
  };
})(typeof window !== 'undefined' ? window : globalThis);
