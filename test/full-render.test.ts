import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderMarkdown,
  renderMarkdownToString,
  StreamMarkdownRenderer,
} from '../src/index.js';

test('renderMarkdownToString fully renders markdown in one call', () => {
  const html = renderMarkdownToString('# History\n\nSaved message');
  assert.match(html, /<h1>History<\/h1>/);
  assert.match(html, /<p>Saved message<\/p>/);
});

test('renderMarkdown returns blocks and snapshot for full rendering', () => {
  const result = renderMarkdown('## Title\n\nBody');
  assert.match(result.html, /<h2>Title<\/h2>/);
  assert.equal(result.snapshot.stableCount, result.blocks.length);
  assert.equal(result.snapshot.sourceLength, '## Title\n\nBody'.length);
});

test('renderMarkdownToString highlights fenced code blocks with explicit languages', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n```');
  assert.match(html, /incremark-code-language">ts<\/span>/);
  assert.match(html, /class="hljs language-ts"/);
  assert.match(html, /hljs-keyword/);
});

test('renderMarkdownToString can auto-detect languages for fenced code blocks', () => {
  const html = renderMarkdownToString('```\nconst value = 1;\n```', {
    highlight: {
      autoDetect: true,
      languages: ['javascript', 'typescript'],
    },
  });

  assert.match(html, /incremark-code-language">(javascript|typescript)<\/span>/);
  assert.match(html, /class="hljs language-(javascript|typescript)"/);
  assert.match(html, /hljs-keyword/);
});

test('renderMarkdownToString can disable syntax highlighting', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n```', {
    highlight: false,
  });

  assert.match(html, /incremark-code-language">ts<\/span>/);
  assert.match(html, /<pre><code class="language-ts">const value = 1;/);
  assert.doesNotMatch(html, /class="hljs/);
});

test('StreamMarkdownRenderer.setMarkdown replaces current state with full content', () => {
  const renderer = new StreamMarkdownRenderer();
  renderer.append('# Draft');

  const patches = renderer.setMarkdown('# Final\n\nComplete body');
  const html = renderer.renderToString();

  assert.ok(patches.length > 0);
  assert.match(html, /<h1>Final<\/h1>/);
  assert.match(html, /<p>Complete body<\/p>/);
});
