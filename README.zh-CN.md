# incremark-renderer

面向聊天界面、LLM 产品和流式内容场景的 Markdown 增量渲染器。它基于 `marked.js`，重点解决“Markdown 一边到达、一边渲染”时的性能、稳定性和可扩展性问题。

- GitHub: [qingyunwy/incremark-renderer](https://github.com/qingyunwy/incremark-renderer)
- npm: [incremark-renderer](https://www.npmjs.com/package/incremark-renderer)
- English documentation: [README.md](./README.md)

## 概览

`incremark-renderer` 是一个基于 `marked.js`、面向渐进式 Markdown 输入的渲染库。

和“每来一个 chunk 就重新解析整篇 Markdown、再把整个 DOM 重刷一遍”的方案不同，它会：

- 保守地判断哪些块已经稳定
- 只重新执行“新增稳定块 + 当前尾块”的 `lexer`
- 对块级 token 树做比较并产出 patch
- 在浏览器里按块做局部 DOM 更新

同时它也提供了生产环境中常见的扩展能力：

- `highlight.js` 代码高亮
- `katex` 数学公式渲染
- `:::` 自定义容器
- 默认开启的 HTML 安全清洗
- 打字机播放和光标跟随工具

## 要解决的问题

朴素的流式 Markdown 方案通常会在每个 chunk 到达时重新解析整篇文档。这类实现往往会遇到相同的问题：

- 文档越长，每次全量解析越贵
- 段落、列表、代码块尚未闭合时会反复抖动
- DOM 整体替换太频繁，容易闪烁
- 业务侧扩展点不够清晰，比如自定义容器、特殊代码块

`incremark-renderer` 就是针对这一类问题设计的。

## 它的优势

- 兼容 `marked.js`：保持在主流 Markdown 工具链之内
- 面向流式输入：核心流程围绕 `append()` 设计
- 保守的稳定块判定：未闭合内容会保留在可变尾部
- 块级局部更新：未变化的块不会重复挂载
- 可扩展：容器、代码块、安全清洗、block 渲染和插件机制都可定制
- 浏览器场景友好：可选 DOM 渲染、打字机播放和光标控制器
- 默认更安全：输出 HTML 默认会经过安全清洗

## 安装

```bash
npm install incremark-renderer
```

## 运行环境说明

- `StreamMarkdownRenderer`、`renderMarkdown()`、`renderMarkdownToString()`、`MarkdownTypewriter`、`StreamingMarkdownTypewriter` 不依赖 DOM。
- `IncrementalDomRenderer`、`StreamingMarkdownController`、`TypewriterCursorController` 是浏览器专用 API，因为它们直接操作 `HTMLElement`。

## 我该用哪个 API？

| 场景 | 运行环境 | 推荐 API |
| --- | --- | --- |
| 在框架适配层、Node.js、Worker 或 SSR 流程中处理流式 Markdown | 通用 JavaScript 运行时 | `StreamMarkdownRenderer` |
| 直接把流式 Markdown 渲染到浏览器 DOM | 浏览器 | `IncrementalDomRenderer` |
| 浏览器侧一站式流式渲染，内置打字机播放和光标跟随 | 浏览器 | `StreamingMarkdownController` |
| 已经拿到完整 Markdown，只需要 HTML | 通用 JavaScript 运行时 | `renderMarkdownToString()` |
| 已经拿到完整 Markdown，同时需要 blocks 和 snapshot 元数据 | 通用 JavaScript 运行时 | `renderMarkdown()` |
| 已经有完整字符串，只需要打字机回放 | 通用 JavaScript 运行时 | `MarkdownTypewriter` |
| 上游内容实时流式到达，需要打字机播放 | 通用 JavaScript 运行时 | `StreamingMarkdownTypewriter` |
| 只需要跟随文本尾部的光标 | 浏览器 | `TypewriterCursorController` |

## 快速开始

### 1. 流式渲染

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();

renderer.append('# 标题\n\n这是一段');
renderer.append('流式 Markdown。');
renderer.finalize();

console.log(renderer.renderToString());
console.log(renderer.getSnapshot());
```

### 2. 浏览器 DOM 渲染

```ts
import { IncrementalDomRenderer } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('缺少 #app 根节点。');
}

const renderer = new IncrementalDomRenderer(root);

renderer.append('## 标题\n\nPart');
renderer.append('ial 内容');
renderer.finalize();
```

### 3. 浏览器流式打字机

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('缺少 #app 根节点。');
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

### 4. 全量渲染

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('# 历史消息\n\n完整内容');
```

如果你还需要 block 元数据：

```ts
import { renderMarkdown } from 'incremark-renderer';

const result = renderMarkdown('# 历史消息\n\n完整内容');

console.log(result.html);
console.log(result.blocks);
console.log(result.snapshot);
```

## 核心概念

### 稳定块与可变尾部

渲染器会把当前输入拆成两部分：

- 稳定块（stable blocks）：已经稳定、不需要再重复 `lexer` 的块
- 可变尾部（mutable tail）：最后一个仍可能继续增长的片段

这也是整个增量渲染性能模型的基础。

### 渲染补丁（render patches）

每次更新会输出块级 patch：

- `insert`：新增可见块
- `replace`：已有块内容发生变化
- `remove`：已有块从可见区移除

这既适合框架层消费，也适合直接驱动 DOM。

## 功能说明

### 全量渲染与流式渲染

如果 Markdown 已经完整可用，请直接用 `renderMarkdownToString()` 或 `renderMarkdown()`。

如果 Markdown 是一段段到达的，请持续调用 `append()`，并在流结束时调用 `finalize()`。

如果你想把一个已有 renderer 的内容一次性替换成新文档，请用 `setMarkdown()`。

### 自定义 `marked` renderer

`StreamMarkdownOptions.marked` 会原样透传给内部的 `marked` 实例。

这意味着你可以继续使用 `marked` 原生的 `renderer`、`tokenizer`、`hooks` 等扩展点，同时保留当前库的增量渲染能力。

例如，下面这个例子会自定义 link 节点的输出：

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

同样的配置形式也适用于浏览器侧 API：

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

需要注意的是，只要没有显式关闭或替换 `sanitizeHtml`，渲染后的 HTML 仍然会经过内置安全清洗。

### 自定义容器

默认支持 `:::` 容器语法。

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString(`:::note 快速开始
这里可以写 **容器内容**。
:::`);
```

默认输出结构包含：

- `.incremark-container`
- `.incremark-container-{type}`
- `[data-container-type="{type}"]`
- `.incremark-container-title`
- `.incremark-container-content`

你也可以完全自定义外层结构：

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  container: {
    render: ({ type, title, innerHtml, closed }) =>
      `<aside class="callout callout-${type}" data-closed="${String(closed)}">${title ? `<h3>${title}</h3>` : ''}${innerHtml}</aside>`,
  },
});
```

这里的 `closed` 表示当前容器是否已经出现闭合 `:::`。

如果你不希望启用容器解析，也可以直接关闭：

```ts
const renderer = new StreamMarkdownRenderer({
  container: false,
});
```

### 代码块与自定义代码块渲染

带语言标记的 fenced code block 默认启用语法高亮。

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('```ts\nconst value = 1;\n```');
```

如果你想对没有语言标记的代码块启用自动识别：

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  highlight: {
    autoDetect: true,
    languages: ['javascript', 'typescript', 'json'],
  },
});
```

自定义代码块 header：

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    renderHeader: ({ code, defaultHeaderContent, closed }) => {
      const encoded = encodeURIComponent(code);
      return `${defaultHeaderContent}<button type="button" data-copy-code="${encoded}" data-closed="${String(closed)}">复制</button>`;
    },
  },
});
```

把特定语言渲染成业务组件：

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

或者统一拦截所有代码块：

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

这里的 `closed` 表示当前围栏代码块（fenced code block）是否已经出现闭合 fence。

如果你希望完全关闭代码高亮，保留普通代码块输出：

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: false,
});
```

### 数学公式

数学公式默认开启。

支持的分隔符：

- 行内：`$...$`、`\(...\)`
- 块级：`$$...$$`、`\[...\]`

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

如果你不希望启用数学公式：

```ts
const renderer = new StreamMarkdownRenderer({
  math: false,
});
```

### HTML 安全清洗

默认会对最终 block HTML 做 sanitizer 处理。

主要拦截这类风险：

- 内联事件属性，比如 `onerror`
- 危险 URL scheme，比如 `javascript:`

只有在 Markdown 输入和所有自定义 HTML hook 都完全可信时，才建议关闭：

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: false,
});
```

如果你希望接入自己的 sanitizer：

```ts
const renderer = new StreamMarkdownRenderer({
  sanitizeHtml: {
    sanitizer: (html) => myTrustedSanitizer(html),
  },
});
```

注意：`container.render`、`highlight.renderHeader`、`highlight.renderBlock`、`renderer.renderBlock()` 返回的 HTML，在默认情况下也仍然会经过 sanitizer。

### 打字机播放

如果你是在浏览器侧接入，`StreamingMarkdownController` 是推荐的高层 API，因为它已经把增量 DOM 渲染、流式打字机播放和光标跟随组合好了：

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('缺少 #app 根节点。');
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

如果你需要更底层的编排控制，可以继续手动组合下面这些基础类。

如果你已经拿到完整 Markdown，可以使用 `MarkdownTypewriter`：

```ts
import {
  IncrementalDomRenderer,
  MarkdownTypewriter,
  TypewriterCursorController,
} from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('缺少 #app 根节点。');
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

如果是对接真实流式上游，请使用 `StreamingMarkdownTypewriter`：

```ts
import {
  IncrementalDomRenderer,
  StreamingMarkdownTypewriter,
} from 'incremark-renderer';

const root = document.getElementById('app');
if (!(root instanceof HTMLElement)) {
  throw new Error('缺少 #app 根节点。');
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

## API 参考

### 主要导出

| 导出项 | 类型 | 运行环境 | 作用 |
| --- | --- | --- | --- |
| `renderMarkdownToString` | function | 通用 JavaScript 运行时 | 全量渲染并返回 HTML 字符串 |
| `renderMarkdown` | function | 通用 JavaScript 运行时 | 全量渲染并返回 `{ html, blocks, snapshot }` |
| `StreamMarkdownRenderer` | class | 通用 JavaScript 运行时 | 不依赖 DOM 的增量渲染器 |
| `IncrementalDomRenderer` | class | 浏览器 | 浏览器 DOM 增量渲染器 |
| `StreamingMarkdownController` | class | 浏览器 | 浏览器侧高层控制器，内置 DOM 渲染、打字机播放和光标处理 |
| `MarkdownTypewriter` | class | 通用 JavaScript 运行时 | 已知完整字符串的打字机回放 |
| `StreamingMarkdownTypewriter` | class | 通用 JavaScript 运行时 | 实时流式输入的打字机 |
| `TypewriterCursorController` | class | 浏览器 | 浏览器打字光标控制器 |
| `extractStableBlocks` | function | 通用 JavaScript 运行时 | 底层稳定块检测工具 |
| `diffAst` | function | 通用 JavaScript 运行时 | 底层 token diff 工具 |
| `digestTokens` | function | 通用 JavaScript 运行时 | 底层 token 摘要工具 |
| `createContainerExtension` | function | 通用 JavaScript 运行时 | 高级 `marked` 扩展导出 |
| `createHighlightExtension` | function | 通用 JavaScript 运行时 | 高级 `marked` 扩展导出 |
| `createMathExtension` | function | 通用 JavaScript 运行时 | 高级 `marked` 扩展导出 |
| `createDefaultHtmlSanitizer` | function | 通用 JavaScript 运行时 | 内置 sanitizer 工厂 |
| `createHtmlSanitizer` | function | 通用 JavaScript 运行时 | 带自定义入口的 sanitizer 工厂 |
| `DefaultBlockRenderer` | class | 通用 JavaScript 运行时 | 默认 block -> HTML 渲染器 |
| `wrapBlockHtml` | function | 通用 JavaScript 运行时 | 给 block HTML 包装元数据外层 |

### `StreamMarkdownRenderer`

#### 构造函数

```ts
new StreamMarkdownRenderer(options?: StreamMarkdownOptions)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `append(chunk: string)` | 追加流式 Markdown，并返回 patch |
| `setMarkdown(markdown: string)` | 用完整文档替换当前状态 |
| `finalize()` | 在流结束时把剩余 tail 刷出 |
| `reset()` | 清空内部状态 |
| `getSnapshot()` | 返回 `{ blocks, stableCount, sourceLength }` |
| `getBlocks()` | 返回当前可见 blocks |
| `renderToString()` | 返回当前 HTML 字符串 |

### `IncrementalDomRenderer`

浏览器专用 API。

#### 构造函数

```ts
new IncrementalDomRenderer(root: HTMLElement, options?: StreamMarkdownOptions)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `append(chunk: string)` | 直接把流式 patch 应用到 DOM |
| `setMarkdown(markdown: string)` | 直接用完整文档替换当前 DOM 状态 |
| `finalize()` | 把剩余 tail 应用到 DOM |
| `reset()` | 清空状态并清空 root |
| `getBlocks()` | 返回当前可见 blocks |
| `renderToString()` | 返回当前 HTML 字符串 |

### `StreamingMarkdownController`

浏览器专用 API。

#### 构造函数

```ts
new StreamingMarkdownController(
  root: HTMLElement,
  options?: StreamingMarkdownControllerOptions,
)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `push(chunk: string)` | 向内部打字机缓冲区追加文本，默认会自动开始播放 |
| `close()` | 标记上游结束，并在播放完成后默认自动执行 DOM `finalize()` |
| `start()` | 手动开始播放 |
| `pause()` | 暂停播放 |
| `resume()` | 恢复播放 |
| `setTypewriterOptions(options)` | 替换打字机节奏配置，并重置当前缓冲中的播放状态 |
| `reset()` | 清空渲染状态、清空 root，并重建内部打字机 |
| `isClosed()` | 返回当前上游是否已结束 |
| `isRunning()` | 返回当前是否正在播放 |
| `getBlocks()` | 返回当前可见 blocks |
| `renderToString()` | 返回当前 HTML 字符串 |
| `destroy()` | 停止播放并移除光标监听 |

底层实例入口：`controller.renderer`、`controller.typewriter`、`controller.cursorController` 会暴露内部实例，方便你在需要时继续做定制。

### `MarkdownTypewriter`

#### 构造函数

```ts
new MarkdownTypewriter(text: string, options: TypewriterOptions)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `start()` | 开始播放 |
| `pause()` | 暂停播放 |
| `resume()` | 恢复播放 |
| `stop()` | 停止播放并重置内部游标 |
| `isRunning()` | 返回当前是否正在播放 |

### `StreamingMarkdownTypewriter`

#### 构造函数

```ts
new StreamingMarkdownTypewriter(options: TypewriterOptions)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `push(chunk: string)` | 向缓冲区追加上游文本 |
| `close()` | 标记上游输入已结束 |
| `isClosed()` | 返回上游是否已结束 |
| `start()` | 开始播放 |
| `pause()` | 暂停播放 |
| `resume()` | 恢复播放 |
| `stop()` | 停止播放并重置内部游标 |
| `isRunning()` | 返回当前是否正在播放 |

### `TypewriterCursorController`

浏览器专用 API。

#### 构造函数

```ts
new TypewriterCursorController(root: HTMLElement, options?: TypewriterCursorOptions)
```

#### 方法

| 方法 | 说明 |
| --- | --- |
| `show()` | 显示光标 |
| `hide()` | 隐藏光标 |
| `update()` | 重新计算光标位置 |
| `destroy()` | 销毁监听和光标 DOM |

## 配置项参考

### `StreamMarkdownOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `marked` | `MarkedOptions` | `undefined` | 透传给 `marked` 的配置，包括 `renderer`、`tokenizer`、`hooks` 等扩展点 |
| `sanitizeHtml` | `HtmlSanitizeOptions \| false` | 开启 | 控制渲染后的 HTML 安全清洗 |
| `container` | `ContainerOptions \| false` | 开启 | 配置 `:::` 容器，或显式关闭 |
| `math` | `MathRenderOptions \| false` | 开启 | 配置数学公式，或显式关闭 |
| `highlight` | `CodeHighlightOptions \| false` | 开启 | 配置代码高亮和代码块自定义渲染 |
| `renderer` | `BlockRenderer` | `DefaultBlockRenderer` | 覆盖 block -> HTML 渲染逻辑 |
| `plugins` | `StreamMarkdownPlugin[]` | `[]` | 监听 block 或 patch 的插件机制 |

### `HtmlSanitizeOptions`

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `sanitizer` | `(html: string) => string` | 自定义 sanitizer 函数 |

### `ContainerOptions`

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `render` | `(context: ContainerRenderContext) => string \| null \| undefined` | 自定义容器外层 HTML |

### `ContainerRenderContext`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `string` | 容器类型 |
| `info` | `string` | `:::` 后的原始 info 字符串 |
| `title` | `string \| undefined` | 解析出的可选标题 |
| `closed` | `boolean` | 当前容器是否已经出现闭合 `:::` |
| `raw` | `string` | 整个容器块的原始源码 |
| `text` | `string` | 容器内部的 Markdown 源码 |
| `innerHtml` | `string` | 默认内层渲染结果 |
| `defaultClassName` | `string` | 默认 class，例如 `incremark-container incremark-container-note` |

### `CodeHighlightOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `autoDetect` | `boolean` | `false` | 是否对未标记语言的 fenced block 做自动识别 |
| `defaultLanguage` | `string` | `undefined` | 未标记语言时使用的默认语言 |
| `languages` | `string[]` | `undefined` | 自动识别时的候选语言范围 |
| `renderHeader` | `CodeBlockHeaderRenderer` | `undefined` | 自定义代码块 header |
| `renderBlock` | `CodeBlockRenderer` | `undefined` | 自定义整个代码块 HTML |
| `languageRenderers` | `Record<string, CodeBlockRenderer>` | `undefined` | 按语言分发的代码块 renderer |

### `CodeBlockHeaderRenderContext`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string` | 原始代码内容 |
| `language` | `string \| undefined` | 最终用于渲染的语言 |
| `declaredLanguage` | `string \| undefined` | fence info string 中声明的语言 |
| `highlighted` | `boolean` | 是否成功命中高亮 |
| `closed` | `boolean` | 当前代码块是否已经出现闭合 fence |
| `defaultHeaderContent` | `string` | 默认语言 badge HTML |

### `CodeBlockRenderContext`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string` | 原始代码内容 |
| `language` | `string \| undefined` | 最终用于渲染的语言 |
| `declaredLanguage` | `string \| undefined` | fence info string 中声明的语言 |
| `highlighted` | `boolean` | 是否成功命中高亮 |
| `closed` | `boolean` | 当前代码块是否已经出现闭合 fence |
| `defaultHeaderContent` | `string` | 默认语言 badge HTML |
| `headerHtml` | `string` | 完整默认 header HTML |
| `bodyHtml` | `string` | 代码内容 HTML |
| `codeClassName` | `string \| undefined` | 应用于 `<code>` 的 className |
| `defaultHtml` | `string` | 完整默认代码块 HTML |

### `MathRenderOptions`

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `katex` | `Omit<KatexOptions, 'displayMode'>` | 透传给 KaTeX 的配置 |

### `StreamMarkdownPlugin`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 插件名称 |
| `onBlockParsed` | `(block: StableBlock) => StableBlock \| void` | block 解析和渲染完成后的 hook |
| `onPatchesComputed` | `(patches: RenderPatch[], snapshot: StreamRendererSnapshot) => void` | patch 计算完成后的 hook |

### `StreamingMarkdownControllerOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `renderer` | `StreamMarkdownOptions` | `{}` | 透传给内部 `IncrementalDomRenderer` 的配置 |
| `typewriter` | `StreamingMarkdownControllerTypewriterOptions` | `{}` | 不包含生命周期回调的打字机节奏配置 |
| `cursor` | `TypewriterCursorOptions \| boolean` | `true` | 是否启用内置光标，或覆盖其配置 |
| `autoStart` | `boolean` | `true` | 首次 `push()` 或 `close()` 时是否自动开始播放 |
| `autoFinalize` | `boolean` | `true` | 播放完成后是否自动调用 `renderer.finalize()` |
| `onChunk` | `(chunk, meta) => void` | `undefined` | 每个 chunk 渲染进 DOM 后触发 |
| `onComplete` | `(meta) => void` | `undefined` | 播放完成且最终 DOM patch 应用后触发 |
| `onPause` | `(meta) => void` | `undefined` | 暂停时触发 |
| `onResume` | `(meta) => void` | `undefined` | 恢复时触发 |
| `onStart` | `(meta) => void` | `undefined` | 开始时触发 |
| `onStateChange` | `(meta) => void` | `undefined` | 播放状态变化时触发 |

### `TypewriterOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `baseDelayMs` | `number` | `26` | 自适应打字节奏的基础延迟 |
| `minChunkSize` | `number` | `2` | 每次输出的最小 chunk 大小 |
| `maxChunkSize` | `number` | `14` | 每次输出的最大 chunk 大小 |
| `onChunk` | `(chunk, meta) => void` | 必填 | 每次输出 chunk 时触发 |
| `onComplete` | `(meta) => void` | 空函数 | 播放完成时触发 |
| `onPause` | `(meta) => void` | 空函数 | 暂停时触发 |
| `onResume` | `(meta) => void` | 空函数 | 恢复时触发 |
| `onStart` | `(meta) => void` | 空函数 | 开始时触发 |
| `onStateChange` | `(meta) => void` | 空函数 | 状态变化时触发 |
| `onStop` | `(meta) => void` | 空函数 | 停止时触发 |

### `TypewriterChunkMeta`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chunk` | `string` | 当前输出片段 |
| `chunkSize` | `number` | 当前片段字符数 |
| `delayMs` | `number` | 下一次输出前的延迟 |
| `done` | `boolean` | 当前是否已播放完成 |
| `closed` | `boolean` | 上游输入是否已结束 |
| `inCodeFence` | `boolean` | 当前可见输出是否处于 fenced code block 内 |
| `cursor` | `number` | 当前绝对游标位置 |
| `total` | `number` | 当前总长度，或流式模式下当前已缓冲长度 |

### `TypewriterEventMeta`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `TypewriterState` | `idle`、`running`、`paused`、`completed`、`stopped` |
| `cursor` | `number` | 当前绝对游标位置 |
| `total` | `number` | 当前总长度，或流式模式下当前已缓冲长度 |
| `closed` | `boolean` | 上游输入是否已结束 |
| `inCodeFence` | `boolean` | 当前可见输出是否处于 fenced code block 内 |
| `lastChunk` | `string \| undefined` | 如果状态变化由一次真实输出触发，这里会带上最后一次 chunk |

### `StreamingMarkdownControllerChunkMeta`

在 `TypewriterChunkMeta` 的基础上新增：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `patches` | `RenderPatch[]` | 当前 chunk 渲染产生的 DOM patch |

### `StreamingMarkdownControllerCompleteMeta`

在 `TypewriterEventMeta` 的基础上新增：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `patches` | `RenderPatch[]` | `renderer.finalize()` 产生的最终 DOM patch |

### `TypewriterCursorOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `className` | `string` | `'incremark-typewriter-cursor'` | 自定义光标 class |
| `autoScroll` | `boolean` | `true` | 是否自动滚动以保持光标可见 |
| `variant` | `'bar' \| 'circle'` | `'bar'` | 内置光标几何样式预设 |

## 核心数据结构

### `StableBlock`

| 字段 | 说明 |
| --- | --- |
| `key` | block 唯一标识 |
| `text` | block 原始源码 |
| `html` | block 渲染后的 HTML |
| `tokens` | block 对应的 `marked` token 列表 |
| `digest` | 用于比较结构变化的摘要 |
| `stable` | 当前 block 是否已经稳定 |

### `RenderPatch`

| 字段 | 说明 |
| --- | --- |
| `type` | `insert`、`replace`、`remove` |
| `key` | block key |
| `index` | 当前可见 block 的索引 |
| `block` | 新 block，按场景可选 |
| `previousBlock` | 旧 block，按场景可选 |
| `astPatches` | 可选的 token-tree diff 信息 |

### `StreamRendererSnapshot`

| 字段 | 说明 |
| --- | --- |
| `blocks` | 当前可见 blocks |
| `stableCount` | 当前稳定块数量 |
| `sourceLength` | 当前累计输入长度 |

## Demo

执行：

```bash
npm run demo
```

然后打开 [http://127.0.0.1:4177/demo/](http://127.0.0.1:4177/demo/)。

demo 页面可以直接验证：

- chunk 级流式输入
- 增量 patch 输出
- block 快照和稳定块数量
- 打字机播放与光标跟随
- 代码高亮、自定义容器、数学公式
- `StreamingMarkdownController` 驱动的浏览器局部更新

## 安全说明

- 默认启用 sanitizer。
- 如果关闭 sanitizer，请把 Markdown 输入和所有自定义 HTML hook 都视为“仅可信输入可用”。
- 业务方返回的自定义 HTML，本身也是安全边界的一部分。

## 致谢

本项目在稳定块边界检测思路上参考了开源项目 [kingshuaishuai/incremark](https://github.com/kingshuaishuai/incremark)。
