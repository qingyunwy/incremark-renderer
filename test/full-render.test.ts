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

test('renderMarkdownToString renders ::: custom containers with nested markdown', () => {
  const html = renderMarkdownToString(':::note Quick Start\nUse **containers** here.\n:::');

  assert.match(html, /class="incremark-container incremark-container-note"/);
  assert.match(html, /data-container-type="note"/);
  assert.match(html, /<div class="incremark-container-title">Quick Start<\/div>/);
  assert.match(html, /<div class="incremark-container-content"><p>Use <strong>containers<\/strong> here\.<\/p>/);
});

test('renderMarkdownToString supports custom ::: container rendering', () => {
  const html = renderMarkdownToString(':::tip Quick Start\nInstall first.\n:::', {
    container: {
      render: ({ type, title, innerHtml }) =>
        `<aside class="callout" data-kind="${type}">${title ? `<h2>${title}</h2>` : ''}${innerHtml}</aside>`,
    },
  });

  assert.match(html, /<aside class="callout" data-kind="tip"><h2>Quick Start<\/h2><p>Install first\.<\/p>/);
  assert.doesNotMatch(html, /incremark-container-content/);
});

test('renderMarkdownToString exposes closed=true for completed ::: containers', () => {
  const html = renderMarkdownToString(':::tip\nReady\n:::', {
    container: {
      render: ({ closed, innerHtml }) => `<aside data-closed="${String(closed)}">${innerHtml}</aside>`,
    },
  });

  assert.match(html, /<aside data-closed="true"><p>Ready<\/p>/);
});

test('renderMarkdownToString exposes closed=false for unfinished ::: containers', () => {
  const html = renderMarkdownToString(':::tip\nDraft', {
    container: {
      render: ({ closed, innerHtml }) => `<aside data-closed="${String(closed)}">${innerHtml}</aside>`,
    },
  });

  assert.match(html, /<aside data-closed="false"><p>Draft<\/p>/);
});

test('renderMarkdownToString ignores ::: markers inside fenced code within containers', () => {
  const html = renderMarkdownToString(':::note Example\n```md\n:::\n```\n:::');

  assert.match(html, /class="incremark-container incremark-container-note"/);
  assert.match(html, /<code[^>]*>:::\n<\/code>/);
});

test('renderMarkdownToString renders unfinished ::: containers as open containers', () => {
  const html = renderMarkdownToString(':::note Draft\nStreaming body');

  assert.match(html, /class="incremark-container incremark-container-note"/);
  assert.match(html, /<div class="incremark-container-title">Draft<\/div>/);
  assert.match(html, /<div class="incremark-container-content"><p>Streaming body<\/p>/);
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

test('renderMarkdownToString exposes closed=true to code block header renderers', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n```', {
    highlight: {
      renderHeader: ({ closed }) => `<span class="closed-flag">${String(closed)}</span>`,
    },
  });

  assert.match(html, /<span class="closed-flag">true<\/span>/);
});

test('renderMarkdownToString exposes closed=false to unfinished code block renderers', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n', {
    highlight: {
      renderBlock: ({ closed, bodyHtml }) =>
        `<div class="code-shell" data-closed="${String(closed)}"><pre><code>${bodyHtml}</code></pre></div>`,
    },
  });

  assert.match(html, /<div class="code-shell" data-closed="false"><pre><code>/);
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

test('renderMarkdownToString supports language-specific custom code block renderers', () => {
  const html = renderMarkdownToString('```markmap\n# Roadmap\n- Item\n```', {
    highlight: {
      languageRenderers: {
        markmap: ({ code, language }) =>
          `<div class="markmap-renderer" data-language="${language}" data-markmap="${encodeURIComponent(code)}"></div>`,
      },
    },
  });

  assert.match(html, /<div class="markmap-renderer" data-language="markmap" data-markmap="%23%20Roadmap%0A-%20Item"><\/div>/);
  assert.doesNotMatch(html, /incremark-code-block/);
});

test('renderMarkdownToString falls back to default renderer when language-specific hook misses', () => {
  const html = renderMarkdownToString('```ts\nconst value = 1;\n```', {
    highlight: {
      languageRenderers: {
        markmap: ({ code }) => `<div class="markmap-renderer">${code}</div>`,
      },
    },
  });

  assert.match(html, /class="incremark-code-block"/);
  assert.match(html, /class="hljs language-ts"/);
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
