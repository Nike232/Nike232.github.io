'use strict';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

hexo.extend.filter.register('marked:use', function(markedUse) {
  markedUse({
    extensions: [{
      name: 'code',
      renderer(token) {
        if (!/^\s*(?:mermaid|mmd)(?:\s|$)/i.test(String(token.lang || ''))) return false;
        return `<pre class="tomfng-mermaid">${escapeHtml(token.text)}</pre>`;
      }
    }]
  });
});
