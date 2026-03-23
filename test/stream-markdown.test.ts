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
