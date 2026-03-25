import test from 'node:test';
import assert from 'node:assert/strict';

import { extractStableBlocks, StreamMarkdownRenderer } from '../src/index.js';

test('extractStableBlocks keeps unfinished paragraph in tail', () => {
  const result = extractStableBlocks('# Title\n\nHello');
  assert.deepEqual(result.stableBlocks, ['# Title\n']);
  assert.equal(result.tail, 'Hello');
});

test('extractStableBlocks closes fenced code blocks only after closing fence', () => {
  const mid = extractStableBlocks('```ts\nconst a = 1;\n');
  assert.equal(mid.stableBlocks.length, 0);
  assert.equal(mid.tail, '```ts\nconst a = 1;\n');

  const done = extractStableBlocks('```ts\nconst a = 1;\n```\n');
  assert.deepEqual(done.stableBlocks, ['```ts\nconst a = 1;\n```\n']);
  assert.equal(done.tail, '');
});

test('extractStableBlocks closes ::: custom containers only after closing marker', () => {
  const mid = extractStableBlocks(':::note\nHello\n');
  assert.equal(mid.stableBlocks.length, 0);
  assert.equal(mid.tail, ':::note\nHello\n');

  const done = extractStableBlocks(':::note\nHello\n:::\n');
  assert.deepEqual(done.stableBlocks, [':::note\nHello\n:::\n']);
  assert.equal(done.tail, '');
});

test('extractStableBlocks ignores ::: markers inside fenced code within custom containers', () => {
  const mid = extractStableBlocks(':::note\n```md\n:::\n```\n');
  assert.equal(mid.stableBlocks.length, 0);
  assert.equal(mid.tail, ':::note\n```md\n:::\n```\n');

  const done = extractStableBlocks(':::note\n```md\n:::\n```\n:::\n');
  assert.deepEqual(done.stableBlocks, [':::note\n```md\n:::\n```\n:::\n']);
  assert.equal(done.tail, '');
});

test('renderer only emits insert for newly stabilized blocks and replace for mutable tail', () => {
  const renderer = new StreamMarkdownRenderer();

  const first = renderer.append('# Demo\n\nHello');
  assert.equal(first.length, 2);
  assert.equal(first[0]?.type, 'insert');
  assert.equal(first[1]?.type, 'insert');

  const second = renderer.append(' world');
  assert.equal(second.length, 1);
  assert.equal(second[0]?.type, 'replace');

  const third = renderer.append('\n\n- item\n');
  assert.equal(third.length, 2);
  assert.equal(third[0]?.type, 'replace');
  assert.equal(third[1]?.type, 'insert');
});

test('renderer keeps unfinished ::: container in tail until it closes', () => {
  const renderer = new StreamMarkdownRenderer();

  const first = renderer.append(':::note\nHello');
  assert.equal(first.length, 1);
  assert.equal(first[0]?.type, 'insert');
  assert.match(renderer.renderToString(), /class="incremark-container incremark-container-note"/);
  assert.match(renderer.renderToString(), /<div class="incremark-container-content"><p>Hello<\/p>/);

  const second = renderer.append('\n:::\n');
  assert.equal(second.length, 1);
  assert.equal(second[0]?.type, 'replace');
  assert.match(renderer.renderToString(), /class="incremark-container incremark-container-note"/);
  assert.match(renderer.renderToString(), /<p>Hello<\/p>/);
});

test('renderer updates closed flag for ::: containers while streaming', () => {
  const renderer = new StreamMarkdownRenderer({
    container: {
      render: ({ closed, innerHtml }) => `<aside data-closed="${String(closed)}">${innerHtml}</aside>`,
    },
  });

  renderer.append(':::note\nHello');
  assert.match(renderer.renderToString(), /<aside data-closed="false"><p>Hello<\/p>/);

  renderer.append('\n:::\n');
  assert.match(renderer.renderToString(), /<aside data-closed="true"><p>Hello<\/p>/);
});

test('renderer updates closed flag for fenced code blocks while streaming', () => {
  const renderer = new StreamMarkdownRenderer({
    highlight: {
      renderBlock: ({ closed, bodyHtml }) =>
        `<div class="code-shell" data-closed="${String(closed)}"><pre><code>${bodyHtml}</code></pre></div>`,
    },
  });

  renderer.append('```ts\nconst a = 1;\n');
  assert.match(renderer.renderToString(), /<div class="code-shell" data-closed="false"><pre><code>/);

  renderer.append('```\n');
  assert.match(renderer.renderToString(), /<div class="code-shell" data-closed="true"><pre><code>/);
});
