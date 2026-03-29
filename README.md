# incremark-renderer

Incremental Markdown renderer for chat interfaces, LLM products, and other frontends that need partial updates without rerendering the entire document.

- GitHub: [qingyunwy/incremark-renderer](https://github.com/qingyunwy/incremark-renderer)
- npm: [incremark-renderer](https://www.npmjs.com/package/incremark-renderer)
- Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## Overview

`incremark-renderer` is a `marked.js`-based renderer for progressively arriving Markdown.

Instead of reparsing the full document and replacing the full DOM on every incoming chunk, it:

- detects stable block boundaries conservatively
- re-lexes only newly stabilized blocks plus the current mutable tail
- diffs block token trees and emits block-level patches
- can apply those patches directly to the browser DOM

It also includes features that are commonly needed in production chat and LLM interfaces:

- fenced code highlighting via `highlight.js`
- inline and block math via `katex`
- custom `:::` container parsing
- HTML sanitization enabled by default
- typewriter playback and cursor utilities

## Why It Exists

Naive streaming Markdown pipelines usually reparse the full document every time a chunk arrives. That approach tends to create the same problems:

- performance cost grows with document length
- unfinished paragraphs, lists, and code fences keep being reparsed
- DOM gets replaced too aggressively, causing visible flicker
- custom integrations such as containers or specialized code blocks become harder to control

`incremark-renderer` is built to solve exactly that class of problem.

## Why Use It

- `marked.js` compatible: stays close to the standard Markdown tooling ecosystem
- streaming-oriented: optimized for append-based rendering
- conservative block stabilization: unfinished content stays in the mutable tail
- partial DOM updates: unchanged blocks remain mounted
- extensible: code blocks, containers, sanitization, block rendering, and plugins are configurable
- browser-ready: optional DOM renderer, typewriter playback, and cursor controller
- safer defaults: rendered HTML is sanitized by default

## Install

```bash
npm install incremark-renderer
```

## Runtime Notes

- `StreamMarkdownRenderer`, `renderMarkdown()`, `renderMarkdownToString()`, `MarkdownTypewriter`, and `StreamingMarkdownTypewriter` do not require the DOM.
- `IncrementalDomRenderer`, `StreamingMarkdownController`, and `TypewriterCursorController` are browser-only APIs because they operate on `HTMLElement` instances.

## Which API Should I Use?

| Scenario | Runtime | Recommended API |
| --- | --- | --- |
| Streaming Markdown in framework adapters, Node.js, workers, or SSR pipelines | Any JavaScript runtime | `StreamMarkdownRenderer` |
| Streaming Markdown directly into the browser DOM | Browser | `IncrementalDomRenderer` |
| Browser-side streaming with built-in typewriter playback and cursor handling | Browser | `StreamingMarkdownController` |
| Full Markdown string already available, only need HTML | Any JavaScript runtime | `renderMarkdownToString()` |
| Full Markdown string already available, also need blocks and snapshot metadata | Any JavaScript runtime | `renderMarkdown()` |
| Typewriter playback for a known full string | Any JavaScript runtime | `MarkdownTypewriter` |
| Typewriter playback for a live upstream stream | Any JavaScript runtime | `StreamingMarkdownTypewriter` |
| Cursor following only | Browser | `TypewriterCursorController` |

## Quick Start

### 1. Streaming Renderer

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();

renderer.append('# Hello\n\nThis is');
renderer.append(' streaming Markdown.');
renderer.finalize();

console.log(renderer.renderToString());
console.log(renderer.getSnapshot());
```

### 2. Browser DOM Rendering

```ts
import { IncrementalDomRenderer } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app root element.');
}

const renderer = new IncrementalDomRenderer(root);

renderer.append('## Title\n\nPart');
renderer.append('ial paragraph');
renderer.finalize();
```

### 3. Browser Stream with Typewriter

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app root element.');
}

const controller = new StreamingMarkdownController(root, {
  typewriter: {
    baseDelayMs: 26,
    minChunkSize: 1,
    maxChunkSize: 12,
  },
});

upstream.on('data', (chunk) => {
  controller.push(chunk);
});

upstream.on('end', () => {
  controller.close();
});
```

### 4. Full Render

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('# History\n\nSaved message');
```

If you also need blocks and snapshot metadata:

```ts
import { renderMarkdown } from 'incremark-renderer';

const result = renderMarkdown('# History\n\nSaved message');

console.log(result.html);
console.log(result.blocks);
console.log(result.snapshot);
```

## Core Concepts

### Stable Blocks and Mutable Tail

The renderer splits content into:

- stable blocks: blocks that are considered complete and will not be re-lexed again
- mutable tail: the last fragment that may still grow with future chunks

This is the foundation for incremental lexing and patch generation.

### Render Patches

Each update emits block-level patches:

- `insert`: a new visible block appeared
- `replace`: an existing block changed
- `remove`: a previous block disappeared

This is useful for framework integrations and direct DOM patching.

## Feature Guide

### Full Rendering vs Streaming

Use `renderMarkdownToString()` or `renderMarkdown()` when the full Markdown payload is already known.

Use `append()` followed by `finalize()` when the Markdown arrives chunk by chunk.

Use `setMarkdown()` if you want to replace the entire current renderer state with a new full document.

### Custom `marked` Renderers

`StreamMarkdownOptions.marked` is passed through to the internal `marked` instance.

That means you can customize built-in `marked` behavior such as `renderer`, `tokenizer`, or `hooks` without leaving the incremental rendering pipeline.

For example, to override how links are rendered:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  marked: {
    renderer: {
      link(token) {
        return `<a data-href="${token.href}">${token.text || token.href}</a>`;
      },
    },
  },
});
```

The same shape also works in browser-facing APIs:

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const controller = new StreamingMarkdownController(root, {
  renderer: {
    marked: {
      renderer: {
        link(token) {
          return `<a data-href="${token.href}">${token.text || token.href}</a>`;
        },
      },
    },
  },
});
```

Note that the built-in HTML sanitizer still runs after rendering unless you disable it or provide a custom sanitizer.

### Custom Containers

`:::` containers are supported out of the box.

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString(`:::note Quick Start
Use **containers** here.
:::`);
```

Default output includes:

- `.incremark-container`
- `.incremark-container-{type}`
- `[data-container-type="{type}"]`
- `.incremark-container-title`
- `.incremark-container-content`

You can customize the output:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  container: {
    render: ({ type, title, innerHtml, closed }) =>
      `<aside class="callout callout-${type}" data-closed="${String(closed)}">${title ? `<h3>${title}</h3>` : ''}${innerHtml}</aside>`,
  },
});
```

`closed` tells you whether the current container already has its closing `:::` marker.

Disable container parsing entirely if needed:

```ts
const renderer = new StreamMarkdownRenderer({
  container: false,
});
```

### Code Blocks and Custom Code Rendering

Explicit-language fenced code blocks are highlighted by default.

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('```ts\nconst value = 1;\n```');
```

Enable auto-detection for untagged fences:

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  highlight: {
    autoDetect: true,
    languages: ['javascript', 'typescript', 'json'],
  },
});
```

Customize the header:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    renderHeader: ({ code, defaultHeaderContent, closed }) => {
      const encoded = encodeURIComponent(code);
      return `${defaultHeaderContent}<button type="button" data-copy-code="${encoded}" data-closed="${String(closed)}">Copy</button>`;
    },
  },
});
```

Render a specific language as a business component instead of a code block:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    languageRenderers: {
      markmap: ({ code, language, closed }) =>
        `<div class="markmap-view" data-language="${language}" data-closed="${String(closed)}" data-markmap="${encodeURIComponent(code)}"></div>`,
    },
  },
});
```

Or intercept every code block with one generic hook:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    renderBlock: ({ declaredLanguage, defaultHtml }) => {
      if (declaredLanguage === 'markmap') {
        return '<div class="markmap-view"></div>';
      }
      return defaultHtml;
    },
  },
});
```

`closed` tells you whether the current fenced block already has its closing fence.

Disable syntax highlighting entirely if you want plain code block output:

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: false,
});
```

### Math

Math is enabled by default.

Supported delimiters:

- inline: `$...$`, `\(...\)`
- block: `$$...$$`, `\[...\]`

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

Disable math completely:

```ts
const renderer = new StreamMarkdownRenderer({
  math: false,
});
```

### HTML Sanitization

Rendered block HTML is sanitized by default.

This protects common untrusted-Markdown cases such as:

- inline event handlers like `onerror`
- dangerous URL schemes like `javascript:`

Disable only if the Markdown input and all custom HTML hooks are fully trusted:

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: false,
});
```

Use a custom sanitizer:

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: {
    sanitizer: (html) => myTrustedSanitizer(html),
  },
});
```

Important: custom HTML returned by `container.render`, `highlight.renderHeader`, `highlight.renderBlock`, or `renderer.renderBlock()` still goes through sanitization unless you disable it.

### Typewriter Playback

For browser-side integrations, `StreamingMarkdownController` is the recommended high-level API because it wires together incremental DOM rendering, streaming typewriter playback, and cursor handling:

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app root element.');
}

const controller = new StreamingMarkdownController(root, {
  renderer: {
    highlight: {
      renderHeader: ({ code, defaultHeaderContent }) =>
        `${defaultHeaderContent}<button data-copy="${encodeURIComponent(code)}">Copy</button>`,
    },
  },
  typewriter: {
    baseDelayMs: 26,
    minChunkSize: 1,
    maxChunkSize: 12,
  },
});

upstream.on('data', (chunk) => {
  controller.push(chunk);
});

upstream.on('end', () => {
  controller.close();
});
```

Use the lower-level classes below when you need custom orchestration.

Use `MarkdownTypewriter` when the full Markdown string is already known:

```ts
import {
  IncrementalDomRenderer,
  MarkdownTypewriter,
  TypewriterCursorController,
} from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app root element.');
}

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

Use `StreamingMarkdownTypewriter` for a live upstream stream:

```ts
import {
  IncrementalDomRenderer,
  StreamingMarkdownTypewriter,
} from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app root element.');
}

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

## API Reference

### Main Exports

| Export | Type | Runtime | Purpose |
| --- | --- | --- | --- |
| `renderMarkdownToString` | function | Any JavaScript runtime | Full render to an HTML string |
| `renderMarkdown` | function | Any JavaScript runtime | Full render to `{ html, blocks, snapshot }` |
| `StreamMarkdownRenderer` | class | Any JavaScript runtime | Incremental renderer without DOM dependencies |
| `IncrementalDomRenderer` | class | Browser | DOM renderer with partial updates |
| `StreamingMarkdownController` | class | Browser | High-level controller that bundles DOM rendering, typewriter playback, and cursor handling |
| `MarkdownTypewriter` | class | Any JavaScript runtime | Typewriter playback for a known full string |
| `StreamingMarkdownTypewriter` | class | Any JavaScript runtime | Typewriter playback for a live stream |
| `TypewriterCursorController` | class | Browser | Cursor-follow utility for browser UIs |
| `extractStableBlocks` | function | Any JavaScript runtime | Low-level stable block detector |
| `diffAst` | function | Any JavaScript runtime | Low-level token diff utility |
| `digestTokens` | function | Any JavaScript runtime | Low-level token digest utility |
| `createContainerExtension` | function | Any JavaScript runtime | Advanced `marked` extension export |
| `createHighlightExtension` | function | Any JavaScript runtime | Advanced `marked` extension export |
| `createMathExtension` | function | Any JavaScript runtime | Advanced `marked` extension export |
| `createDefaultHtmlSanitizer` | function | Any JavaScript runtime | Built-in sanitizer factory |
| `createHtmlSanitizer` | function | Any JavaScript runtime | Sanitizer factory with custom override |
| `DefaultBlockRenderer` | class | Any JavaScript runtime | Default block-to-HTML renderer |
| `wrapBlockHtml` | function | Any JavaScript runtime | Wrap rendered block HTML with block metadata |

### `StreamMarkdownRenderer`

#### Constructor

```ts
new StreamMarkdownRenderer(options?: StreamMarkdownOptions)
```

#### Methods

| Method | Description |
| --- | --- |
| `append(chunk: string)` | Append streaming Markdown and return render patches |
| `setMarkdown(markdown: string)` | Replace current state with a complete Markdown document |
| `finalize()` | Flush the remaining tail when the upstream stream is complete |
| `reset()` | Clear all internal state |
| `getSnapshot()` | Return `{ blocks, stableCount, sourceLength }` |
| `getBlocks()` | Return the current visible blocks |
| `renderToString()` | Return the current rendered HTML |

### `IncrementalDomRenderer`

Browser-only API.

#### Constructor

```ts
new IncrementalDomRenderer(root: HTMLElement, options?: StreamMarkdownOptions)
```

#### Methods

| Method | Description |
| --- | --- |
| `append(chunk: string)` | Apply streaming patches directly to the DOM |
| `setMarkdown(markdown: string)` | Replace current DOM state with a full document |
| `finalize()` | Flush the remaining tail into the DOM |
| `reset()` | Clear renderer state and empty the root node |
| `getBlocks()` | Return current visible blocks |
| `renderToString()` | Return current rendered HTML as a string |

### `StreamingMarkdownController`

Browser-only API.

#### Constructor

```ts
new StreamingMarkdownController(
  root: HTMLElement,
  options?: StreamingMarkdownControllerOptions,
)
```

#### Methods

| Method | Description |
| --- | --- |
| `push(chunk: string)` | Push upstream text into the internal typewriter buffer and auto-start by default |
| `close()` | Mark the upstream source as closed and finalize the DOM on completion by default |
| `start()` | Start playback manually |
| `pause()` | Pause playback |
| `resume()` | Resume playback |
| `setTypewriterOptions(options)` | Replace typewriter cadence settings and reset the buffered playback state |
| `reset()` | Clear renderer state, clear the root node, and recreate the internal typewriter |
| `isClosed()` | Return whether the current upstream source is closed |
| `isRunning()` | Return whether playback is currently active |
| `getBlocks()` | Return current visible blocks |
| `renderToString()` | Return current rendered HTML as a string |
| `destroy()` | Stop playback and remove cursor listeners |

Low-level access: `controller.renderer`, `controller.typewriter`, and `controller.cursorController` expose the underlying instances when you need custom wiring.

### `MarkdownTypewriter`

#### Constructor

```ts
new MarkdownTypewriter(text: string, options: TypewriterOptions)
```

#### Methods

| Method | Description |
| --- | --- |
| `start()` | Start playback |
| `pause()` | Pause playback |
| `resume()` | Resume playback |
| `stop()` | Stop playback and reset internal cursor |
| `isRunning()` | Return whether playback is currently active |

### `StreamingMarkdownTypewriter`

#### Constructor

```ts
new StreamingMarkdownTypewriter(options: TypewriterOptions)
```

#### Methods

| Method | Description |
| --- | --- |
| `push(chunk: string)` | Push upstream text into the typewriter buffer |
| `close()` | Mark the upstream source as closed |
| `isClosed()` | Return whether the upstream source is closed |
| `start()` | Start playback |
| `pause()` | Pause playback |
| `resume()` | Resume playback |
| `stop()` | Stop playback and reset internal cursor |
| `isRunning()` | Return whether playback is currently active |

### `TypewriterCursorController`

Browser-only API.

#### Constructor

```ts
new TypewriterCursorController(root: HTMLElement, options?: TypewriterCursorOptions)
```

#### Methods

| Method | Description |
| --- | --- |
| `show()` | Show the cursor |
| `hide()` | Hide the cursor |
| `update()` | Recalculate cursor position |
| `destroy()` | Remove listeners and cursor DOM |

## Options Reference

### `StreamMarkdownOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `marked` | `MarkedOptions` | `undefined` | Pass-through `marked` configuration, including `renderer`, `tokenizer`, and `hooks` |
| `sanitizeHtml` | `HtmlSanitizeOptions \| false` | enabled | Control the post-render HTML sanitizer |
| `container` | `ContainerOptions \| false` | enabled | Configure `:::` containers or disable them |
| `math` | `MathRenderOptions \| false` | enabled | Configure math rendering or disable it |
| `highlight` | `CodeHighlightOptions \| false` | enabled | Configure code block highlighting and custom renderers |
| `renderer` | `BlockRenderer` | `DefaultBlockRenderer` | Override block-to-HTML rendering |
| `plugins` | `StreamMarkdownPlugin[]` | `[]` | Observe parsed blocks or emitted patches |

### `HtmlSanitizeOptions`

| Option | Type | Description |
| --- | --- | --- |
| `sanitizer` | `(html: string) => string` | Custom sanitizer function |

### `ContainerOptions`

| Option | Type | Description |
| --- | --- | --- |
| `render` | `(context: ContainerRenderContext) => string \| null \| undefined` | Custom container HTML renderer |

### `ContainerRenderContext`

| Field | Type | Description |
| --- | --- | --- |
| `type` | `string` | Container type from the opening line |
| `info` | `string` | Raw info string after `:::` |
| `title` | `string \| undefined` | Optional parsed title |
| `closed` | `boolean` | Whether the closing `:::` marker is already present |
| `raw` | `string` | Raw source for the whole container block |
| `text` | `string` | Inner Markdown source |
| `innerHtml` | `string` | Default rendered inner HTML |
| `defaultClassName` | `string` | Built-in class name such as `incremark-container incremark-container-note` |

### `CodeHighlightOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autoDetect` | `boolean` | `false` | Auto-detect language for fences without a declared language |
| `defaultLanguage` | `string` | `undefined` | Fallback language when the fence has no language |
| `languages` | `string[]` | `undefined` | Restrict auto-detection candidates |
| `renderHeader` | `CodeBlockHeaderRenderer` | `undefined` | Customize the code block header |
| `renderBlock` | `CodeBlockRenderer` | `undefined` | Customize full code block HTML |
| `languageRenderers` | `Record<string, CodeBlockRenderer>` | `undefined` | Per-language code block renderers |

### `CodeBlockHeaderRenderContext`

| Field | Type | Description |
| --- | --- | --- |
| `code` | `string` | Raw code block content |
| `language` | `string \| undefined` | Final language used for rendering |
| `declaredLanguage` | `string \| undefined` | Language declared in the fence info string |
| `highlighted` | `boolean` | Whether syntax highlighting succeeded |
| `closed` | `boolean` | Whether the closing code fence is already present |
| `defaultHeaderContent` | `string` | Built-in language badge HTML |

### `CodeBlockRenderContext`

| Field | Type | Description |
| --- | --- | --- |
| `code` | `string` | Raw code block content |
| `language` | `string \| undefined` | Final language used for rendering |
| `declaredLanguage` | `string \| undefined` | Language declared in the fence info string |
| `highlighted` | `boolean` | Whether syntax highlighting succeeded |
| `closed` | `boolean` | Whether the closing code fence is already present |
| `defaultHeaderContent` | `string` | Built-in language badge HTML |
| `headerHtml` | `string` | Full built-in header HTML |
| `bodyHtml` | `string` | Rendered code HTML |
| `codeClassName` | `string \| undefined` | Final class name applied to `<code>` |
| `defaultHtml` | `string` | Full built-in code block HTML |

### `MathRenderOptions`

| Option | Type | Description |
| --- | --- | --- |
| `katex` | `Omit<KatexOptions, 'displayMode'>` | KaTeX options for both inline and block math |

### `StreamMarkdownPlugin`

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Plugin name |
| `onBlockParsed` | `(block: StableBlock) => StableBlock \| void` | Hook after a block is parsed and rendered |
| `onPatchesComputed` | `(patches: RenderPatch[], snapshot: StreamRendererSnapshot) => void` | Hook after patches are computed |

### `StreamingMarkdownControllerOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `renderer` | `StreamMarkdownOptions` | `{}` | Pass-through options for the internal `IncrementalDomRenderer` |
| `typewriter` | `StreamingMarkdownControllerTypewriterOptions` | `{}` | Typewriter timing options without lifecycle callbacks |
| `cursor` | `TypewriterCursorOptions \| boolean` | `true` | Enable the built-in cursor or override its options |
| `autoStart` | `boolean` | `true` | Automatically start playback on the first `push()` or `close()` |
| `autoFinalize` | `boolean` | `true` | Call `renderer.finalize()` when playback completes |
| `onChunk` | `(chunk, meta) => void` | `undefined` | Called after each emitted chunk is rendered into the DOM |
| `onComplete` | `(meta) => void` | `undefined` | Called after playback completes and final DOM patches are applied |
| `onPause` | `(meta) => void` | `undefined` | Called when playback pauses |
| `onResume` | `(meta) => void` | `undefined` | Called when playback resumes |
| `onStart` | `(meta) => void` | `undefined` | Called when playback starts |
| `onStateChange` | `(meta) => void` | `undefined` | Called whenever the playback state changes |

### `TypewriterOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseDelayMs` | `number` | `26` | Base delay used for adaptive playback |
| `minChunkSize` | `number` | `2` | Minimum emitted chunk size |
| `maxChunkSize` | `number` | `14` | Maximum emitted chunk size |
| `onChunk` | `(chunk, meta) => void` | required | Called for every emitted chunk |
| `onComplete` | `(meta) => void` | no-op | Called when playback completes |
| `onPause` | `(meta) => void` | no-op | Called when playback pauses |
| `onResume` | `(meta) => void` | no-op | Called when playback resumes |
| `onStart` | `(meta) => void` | no-op | Called when playback starts |
| `onStateChange` | `(meta) => void` | no-op | Called whenever the state changes |
| `onStop` | `(meta) => void` | no-op | Called when playback stops |

### `TypewriterChunkMeta`

| Field | Type | Description |
| --- | --- | --- |
| `chunk` | `string` | Emitted text fragment |
| `chunkSize` | `number` | Emitted character count |
| `delayMs` | `number` | Next adaptive delay |
| `done` | `boolean` | Whether playback is complete |
| `closed` | `boolean` | Whether the upstream source is closed |
| `inCodeFence` | `boolean` | Whether the current visible output is inside a fenced code block |
| `cursor` | `number` | Current absolute text cursor |
| `total` | `number` | Current source length or buffered source length |

### `TypewriterEventMeta`

| Field | Type | Description |
| --- | --- | --- |
| `state` | `TypewriterState` | `idle`, `running`, `paused`, `completed`, or `stopped` |
| `cursor` | `number` | Current absolute text cursor |
| `total` | `number` | Current source length or buffered source length |
| `closed` | `boolean` | Whether the upstream source is closed |
| `inCodeFence` | `boolean` | Whether the current visible output is inside a fenced code block |
| `lastChunk` | `string \| undefined` | Last emitted chunk if the transition was triggered by output |

### `StreamingMarkdownControllerChunkMeta`

Extends `TypewriterChunkMeta` with:

| Field | Type | Description |
| --- | --- | --- |
| `patches` | `RenderPatch[]` | DOM patches produced by the chunk render |

### `StreamingMarkdownControllerCompleteMeta`

Extends `TypewriterEventMeta` with:

| Field | Type | Description |
| --- | --- | --- |
| `patches` | `RenderPatch[]` | Final DOM patches produced by `renderer.finalize()` |

### `TypewriterCursorOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `'incremark-typewriter-cursor'` | Custom cursor class name |
| `autoScroll` | `boolean` | `true` | Auto-scroll the container to keep the cursor visible |
| `variant` | `'bar' \| 'circle'` | `'bar'` | Built-in cursor geometry preset |

## Core Data Structures

### `StableBlock`

| Field | Description |
| --- | --- |
| `key` | Stable block identifier |
| `text` | Raw block source |
| `html` | Rendered HTML |
| `tokens` | `marked` token list for the block |
| `digest` | Structural digest used for comparisons |
| `stable` | Whether the block is already stabilized |

### `RenderPatch`

| Field | Description |
| --- | --- |
| `type` | `insert`, `replace`, or `remove` |
| `key` | Block key |
| `index` | Visible block index |
| `block` | Next block when applicable |
| `previousBlock` | Previous block when applicable |
| `astPatches` | Optional token-tree diff metadata |

### `StreamRendererSnapshot`

| Field | Description |
| --- | --- |
| `blocks` | Current visible blocks |
| `stableCount` | Number of stabilized blocks |
| `sourceLength` | Total accumulated source length |

## Demo

Run the local demo page:

```bash
npm run demo
```

Then open [http://127.0.0.1:4177/demo/](http://127.0.0.1:4177/demo/).

The demo shows:

- chunk-by-chunk Markdown streaming
- incremental patch output
- block snapshots and stable block counts
- typewriter playback and cursor following
- code highlighting, custom containers, and math rendering
- browser DOM updates driven by `StreamingMarkdownController`

## Security Notes

- Sanitization is enabled by default.
- If you disable sanitization, treat all Markdown and custom HTML hooks as trusted-only.
- If you return custom HTML from render hooks, that HTML is part of your security boundary.

## Acknowledgements

The stable block boundary detection approach in this project references ideas from the open source project [kingshuaishuai/incremark](https://github.com/kingshuaishuai/incremark).
