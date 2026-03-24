import test from 'node:test';
import assert from 'node:assert/strict';

import { StreamMarkdownRenderer } from '../src/index.js';

test('renders inline TeX formulas', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('Inline math $E = mc^2$ here.');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /incremark-math-inline/);
  assert.match(html, /<math/);
});

test('renders block TeX formulas', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /incremark-math-block/);
  assert.match(html, /<math/);
});

test('renders inline LaTeX formulas with parenthesis delimiters', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('Inline math \\(a^2 + b^2 = c^2\\) here.');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /incremark-math-inline/);
  assert.match(html, /<math/);
});

test('renders block LaTeX formulas with bracket delimiters', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('\\[\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}\n\\]');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /incremark-math-block/);
  assert.match(html, /<math/);
});

test('falls back to the original inline formula when KaTeX throws', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('bad: \\(\\notacommand{1}\\)');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /\\\(\\notacommand\{1\}\\\)/);
  assert.doesNotMatch(html, /incremark-math-inline/);
});

test('falls back to the original block formula when KaTeX throws', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('\\[\n\\notacommand{1}\n\\]');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /\\\[\n\\notacommand\{1\}\n\\\]/);
  assert.doesNotMatch(html, /incremark-math-block/);
});

test('preserves backslash-delimited math markers inside inline code spans', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('- 行内公式：`$...$`、`\\(...\\)`\n- 块级公式：`$$...$$`、`\\[...\\]`');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.match(html, /<code>\$...\$<\/code>、<code>\\\(...\\\)<\/code>/);
  assert.match(html, /<code>\$\$...\$\$<\/code>、<code>\\\[\.\.\.\\\]<\/code>/);
});

test('preserves backslash-delimited math markers inside fenced code blocks', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('```md\n\\(...\\)\n\\[...\\]\n```');
  renderer.finalize();

  const html = renderer.renderToString();
  assert.ok(html.includes('\\(...\\)'));
  assert.ok(html.includes('\\[...\\]'));
});
