# incremark-renderer

`incremark-renderer` is a streaming Markdown rendering package built on top of `marked.js`, with:

- stable block boundary detection inspired by Incremark's incremental parsing approach
- incremental block lexing without full-document `lexer` reruns
- AST-aware diffing to generate minimal render patches
- a DOM renderer that applies partial updates instead of full reflow/repaint
- a ChatGPT-style markdown typewriter for frontend streaming playback
- built-in fenced code syntax highlighting powered by `highlight.js`
- TeX/LaTeX math support for inline and block formulas
- built-in HTML sanitization for rendered output

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## Install

```bash
npm install incremark-renderer
```

## Highlights

- Uses `marked.js` as the underlying parser while keeping lexing incremental.
- Re-lexes only newly stabilized blocks and the current mutable tail.
- Exposes dedicated full-render APIs for history and non-streaming views.
- Emits block-level render patches so unchanged DOM stays mounted.
- Highlights fenced code blocks out of the box and emits `hljs` / `language-*` classes.
- Supports inline math, block math, adaptive typewriter playback, and a DOM cursor controller.
- Sanitizes rendered HTML by default to strip dangerous raw HTML and URL schemes.

## Quick Start

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();

renderer.append('# Hello\n\nThis is');
renderer.append(' streaming markdown.');
renderer.finalize();

console.log(renderer.renderToString());
```

## Full Rendering

For history views, initial page load, or any scenario where you already have the
complete Markdown payload, you can use the full-render APIs directly.

### Stateless full render

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('# History\n\nSaved message');
```

If you also need block metadata and a snapshot:

```ts
import { renderMarkdown } from 'incremark-renderer';

const result = renderMarkdown('# History\n\nSaved message');

console.log(result.html);
console.log(result.blocks);
console.log(result.snapshot);
```

### Replace an existing renderer with full content

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();
renderer.setMarkdown('# Full message\n\nLoaded from history');
```

`IncrementalDomRenderer` also exposes `setMarkdown(markdown)` for one-shot DOM updates.

## Core APIs

### `StreamMarkdownRenderer`

Framework-agnostic incremental renderer that returns structured patches.

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();
const patches = renderer.append('## Title\n\nHello');

console.log(patches);
console.log(renderer.getSnapshot());
```

## Browser DOM rendering

```ts
import { IncrementalDomRenderer } from 'incremark-renderer';

const root = document.getElementById('app')!;
const renderer = new IncrementalDomRenderer(root);

renderer.append('# Title\n\nPartial');
renderer.append(' paragraph');
renderer.finalize();
```

## HTML Sanitization

Rendered block HTML is sanitized by default before it is returned from
`renderMarkdownToString()` or mounted by `IncrementalDomRenderer`. This removes
dangerous inline handlers and URL schemes such as `javascript:` while preserving
the renderer's own code-block markup, container markup, and MathML output.

Disable sanitization only if both the Markdown input and all custom render hooks
are fully trusted:

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: false,
});
```

You can also provide a custom sanitizer function:

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: {
    sanitizer: (html) => myTrustedSanitizer(html),
  },
});
```

### Patch Types

`StreamMarkdownRenderer` and `IncrementalDomRenderer` work with three patch kinds:

- `insert`: a new block became visible
- `replace`: an existing block changed and should be rerendered
- `remove`: a previously visible block disappeared

Each patch may also contain `astPatches` describing the token-tree diff for that block.

## Math Formulas

Inline formulas:

```md
Euler: $e^{i\pi} + 1 = 0$
Also supported: \(a^2 + b^2 = c^2\)
```

Block formulas:

```md
$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

\[
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\]
```

Math support is enabled by default and rendered through `katex` using MathML output, so it works in the demo without importing an extra stylesheet.

### Math Error Handling

By default, `katex.renderToString` runs with `throwOnError: true`.

- If a formula parses successfully, it is rendered as math.
- If KaTeX throws, the original formula string is rendered back as plain text.

You can override KaTeX options through `math.katex`:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  math: {
    katex: {
      throwOnError: true,
      macros: {
        '\\RR': '\\mathbb{R}',
      },
    },
  },
});
```

To disable math handling entirely:

```ts
const renderer = new StreamMarkdownRenderer({
  math: false,
});
```

## Custom Containers

`:::` containers are supported out of the box and parsed as dedicated block tokens.
The opening line accepts a container type and an optional title, while the body can
contain nested Markdown, fenced code blocks, and other supported syntax.

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString(`:::note Quick Start
Use **containers** here.
:::`);
```

By default the renderer outputs:

- `.incremark-container`
- `.incremark-container-{type}`
- `[data-container-type="{type}"]`
- `.incremark-container-title`
- `.incremark-container-content`

Customize the wrapper markup if you want your own callout structure:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  container: {
    render: ({ type, title, innerHtml }) =>
      `<aside class="callout callout-${type}">${title ? `<h3>${title}</h3>` : ''}${innerHtml}</aside>`,
  },
});
```

Disable container parsing entirely if needed:

```ts
const renderer = new StreamMarkdownRenderer({
  container: false,
});
```

## Code Highlighting

Fenced code blocks with an explicit language info string are highlighted by default.
The renderer emits `hljs`, `language-*`, and `incremark-code-language` related markup,
so you can attach your own theme styles in the app layer.

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('```ts\nconst value = 1;\n```');
```

To auto-detect untagged fenced blocks or force a default language:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  highlight: {
    autoDetect: true,
    languages: ['javascript', 'typescript', 'json'],
  },
});
```

Disable syntax highlighting if you want plain `marked` code block output:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: false,
});
```

Customize the `incremark-code-block-header` content if you want to add copy
buttons or other actions:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    renderHeader: ({ code, defaultHeaderContent }) => {
      const encoded = encodeURIComponent(code);
      return `${defaultHeaderContent}<button type="button" class="copy-button" data-copy-code="${encoded}">Copy</button>`;
    },
  },
});

root.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  const encoded = target.dataset.copyCode;
  if (!encoded) {
    return;
  }
  await navigator.clipboard.writeText(decodeURIComponent(encoded));
});
```

## Typewriter Playback

```ts
import {
  IncrementalDomRenderer,
  MarkdownTypewriter,
  StreamingMarkdownTypewriter,
  TypewriterCursorController,
} from 'incremark-renderer';

const root = document.getElementById('app')!;
const renderer = new IncrementalDomRenderer(root);
const cursor = new TypewriterCursorController(root);

const typewriter = new MarkdownTypewriter('# Hello\n\nStreaming markdown.', {
  baseDelayMs: 26,
  minChunkSize: 1,
  maxChunkSize: 12,
  onChunk: (chunk, meta) => {
    renderer.append(chunk);
    if (meta.inCodeFence) {
      cursor.hide();
    } else {
      cursor.show();
      cursor.update();
    }
  },
  onComplete: () => {
    cursor.hide();
    renderer.finalize();
  },
});

typewriter.start();
```

Use `MarkdownTypewriter` when the full Markdown string is already known. For real
upstream streaming, use `StreamingMarkdownTypewriter`:

```ts
import {
  IncrementalDomRenderer,
  StreamingMarkdownTypewriter,
} from 'incremark-renderer';

const root = document.getElementById('app')!;
const renderer = new IncrementalDomRenderer(root);
const typewriter = new StreamingMarkdownTypewriter({
  onChunk: (chunk) => {
    renderer.append(chunk);
  },
  onComplete: () => {
    renderer.finalize();
  },
});

typewriter.start();

upstream.on('data', (chunk) => {
  typewriter.push(chunk);
});

upstream.on('end', () => {
  typewriter.close();
});
```

### Typewriter Metadata

Each `onChunk` callback receives `TypewriterChunkMeta`:

- `chunk`: the emitted text fragment
- `chunkSize`: emitted character count
- `delayMs`: next adaptive delay
- `done`: whether playback is complete
- `closed`: whether the source has been fully closed
- `inCodeFence`: whether the currently visible output is inside a fenced code block
- `cursor`: current absolute text cursor
- `total`: current source length or currently buffered source length

`inCodeFence` is especially useful for hiding cursor effects while code blocks are being streamed.

Lifecycle callbacks receive `TypewriterEventMeta`:

- `state`: current state (`idle`, `running`, `paused`, `completed`, `stopped`)
- `cursor`: current absolute text cursor
- `total`: current source length or currently buffered source length
- `closed`: whether the source is complete
- `inCodeFence`: whether the visible output is currently inside a fenced code block
- `lastChunk`: last emitted chunk when a transition was triggered by output completion

Available callbacks:

- `onStart(meta)`
- `onPause(meta)`
- `onResume(meta)`
- `onStop(meta)`
- `onComplete(meta)`
- `onStateChange(meta)`

## Demo

Run a local verification page:

```bash
npm run demo
```

Then open [http://127.0.0.1:4177/demo/](http://127.0.0.1:4177/demo/).

The demo page shows:

- chunk-by-chunk Markdown streaming input
- ChatGPT-style adaptive typewriter playback
- typewriter cursor follow behavior
- hidden cursor while fenced code blocks are streaming
- inline and block math rendering
- emitted incremental patches
- current block snapshot and stable block count
- live DOM output rendered by `IncrementalDomRenderer`

## Design

### 1. Stable block boundary detection

The package continuously scans only the mutable tail and advances the stable prefix when a block is unquestionably complete. Fenced code blocks, headings, setext headings, and blank-line-delimited blocks are handled explicitly so unfinished content stays in the tail for the next incremental pass.

### 2. Incremental lexer pipeline

Stable blocks are lexed exactly once with `marked.lexer`. Only two regions are ever lexed again:

- newly stabilized blocks produced from the current tail
- the current mutable tail block

This keeps lexing cost bounded in high-frequency streaming scenarios.

### 3. AST diff and local rerender

Each block stores the `marked` token tree and a structural digest. On each update, the renderer compares previous and next ASTs and emits render patches:

- `insert` for new blocks
- `replace` for changed AST subtrees
- `remove` for blocks that disappear after finalization or reset flows

The built-in DOM renderer applies those patches to `[data-incremark-block]` wrappers and, when the DOM shape stays the same, updates text and attributes in place before falling back to full block replacement.

## Extensibility

You can provide:

- `renderer.renderBlock(block)` to override block-to-HTML rendering
- `plugins` to inspect parsed blocks or emitted patches
- `marked` options to customize tokenization/rendering behavior while preserving `marked.js` compatibility
- `math.katex` to customize KaTeX rendering behavior
- `TypewriterCursorController` to build cursor-following playback UIs

## Notes

- The package is optimized around block-level incremental rendering rather than full-document AST reconciliation.
- Stable boundary detection is intentionally conservative for streaming safety, especially around paragraphs and fenced blocks.
- The demo server is for local verification and is not intended to be used as a production asset server.

## Acknowledgements

This project's stable block boundary detection approach references the ideas from the open source project [kingshuaishuai/incremark](https://github.com/kingshuaishuai/incremark).
