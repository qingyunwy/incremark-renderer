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

test('renderMarkdownToString can customize code block header actions', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n```', {
    highlight: {
      renderHeader: ({ code, defaultHeaderContent, declaredLanguage, highlighted, language }) =>
        `${defaultHeaderContent}<button type="button" class="copy-button" data-code="${encodeURIComponent(code)}" data-declared-language="${declaredLanguage}" data-highlighted="${String(highlighted)}" data-language="${language}">Copy</button>`,
    },
  });

  assert.match(html, /<div class="incremark-code-block-header">/);
  assert.match(html, /incremark-code-language">ts<\/span>/);
  assert.match(html, /class="copy-button"/);
  assert.match(html, /data-code="const%20value%20%3D%201%3B"/);
  assert.match(html, /data-declared-language="ts"/);
  assert.match(html, /data-highlighted="true"/);
});

test('renderMarkdownToString can render custom code block header without a language badge', () => {
  const html = renderMarkdownToString('```\nplain text\n```', {
    highlight: {
      renderHeader: ({ defaultHeaderContent, language }) => {
        assert.equal(defaultHeaderContent, '');
        assert.equal(language, undefined);
        return '<button type="button" class="plain-copy-button">Copy</button>';
      },
    },
  });

  assert.match(html, /<div class="incremark-code-block-header"><button type="button" class="plain-copy-button">Copy<\/button><\/div>/);
  assert.doesNotMatch(html, /incremark-code-language/);
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
