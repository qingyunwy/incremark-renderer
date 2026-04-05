import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdownToString } from '../src/index.js';

test('renderMarkdownToString sanitizes raw HTML event handlers by default', () => {
  const html = renderMarkdownToString('<img src="/safe.png" onerror="alert(1)">');

  assert.match(html, /<img src="\/safe\.png">/);
  assert.doesNotMatch(html, /onerror=/);
});

test('renderMarkdownToString strips dangerous javascript URLs by default', () => {
  const linkHtml = renderMarkdownToString('[click](javascript:alert(1))');
  const imageHtml = renderMarkdownToString('![x](javascript:alert(1))');

  assert.doesNotMatch(linkHtml, /javascript:/i);
  assert.doesNotMatch(imageHtml, /javascript:/i);
});

test('renderMarkdownToString can disable HTML sanitization explicitly', () => {
  const html = renderMarkdownToString('<img src="/safe.png" onerror="alert(1)">', {
    sanitizeHtml: false,
  });

  assert.match(html, /onerror="alert\(1\)"/);
});

test('renderMarkdownToString preserves task list checkboxes after sanitization', () => {
  const html = renderMarkdownToString([
    '- [x] Completed task',
    '- [X] Also completed',
    '- [ ] Pending task',
    '  - [x] Nested completed task',
    '  - [ ] Nested pending task',
  ].join('\n'));

  assert.match(html, /<input checked(?:="")? disabled(?:="")? type="checkbox"> Completed task/);
  assert.match(html, /<input checked(?:="")? disabled(?:="")? type="checkbox"> Also completed/);
  assert.match(html, /<input disabled(?:="")? type="checkbox"> Pending task/);
  assert.match(html, /Nested completed task/);
  assert.match(html, /Nested pending task/);
  assert.doesNotMatch(html, /&lt;input/);
});
