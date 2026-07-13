'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const Hexo = require('hexo');

let hexo;

before(async () => {
  hexo = new Hexo(process.cwd(), { silent: true });
  await hexo.init();
});

after(async () => {
  await hexo?.exit();
});

test('published Hexo articles render inline and block KaTeX', async () => {
  const html = await hexo.render.render({
    engine: 'markdown',
    text: [
      '质能关系为 $E = mc^2$。',
      '',
      '$$',
      '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
      '$$'
    ].join('\n')
  });

  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<annotation encoding="application\/x-tex">E = mc\^2<\/annotation>/);
  assert.doesNotMatch(html, /latex\.codecogs\.com/i);
});

test('published KaTeX keeps untrusted commands inert', async () => {
  const html = await hexo.render.render({
    engine: 'markdown',
    text: '$\\href{javascript:alert(1)}{unsafe}$'
  });

  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('published Hexo articles preserve Mermaid blocks for browser rendering', async () => {
  const html = await hexo.render.render({
    engine: 'markdown',
    text: [
      '```mermaid',
      'graph TD',
      '  A[开始] --> B[完成]',
      '```',
      '',
      '```js',
      'const answer = 42;',
      '```'
    ].join('\n')
  });

  assert.match(html, /^<pre class="tomfng-mermaid">graph TD/);
  assert.match(html, /A\[开始\] --&gt; B\[完成\]/);
  assert.match(html, /<code class="language-js">const answer = 42;/);
});
