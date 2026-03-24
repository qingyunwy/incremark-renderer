# incremark-renderer

`incremark-renderer` 是一个基于 `marked.js` 的流式 Markdown 渲染 npm 包，面向长文本、高频增量输入和接近 ChatGPT 体验的前端输出场景。

它当前具备以下能力：

- 基于稳定块边界检测的增量解析
- 只对新增稳定块和当前尾块执行 `marked.lexer`
- 基于 token / AST 的局部 Diff 与块级局部重渲染
- 面向浏览器的 DOM 增量渲染器
- 历史消息 / 非流式场景下的全量渲染 API
- ChatGPT 风格的自适应打字机播放
- 打字光标跟随控制器
- 内置 fenced code block 代码高亮能力
- TeX / LaTeX 行内与块级数学公式渲染

English documentation: [README.md](./README.md)

## 安装

```bash
npm install incremark-renderer
```

## 核心特性

### 1. 严格基于 `marked.js`

项目底层解析器固定为 `marked.js`，没有替换成其他 Markdown 解析库，便于兼容既有生态和规则扩展。

### 2. 增量 Lexer

不会在每次流式输入后重新对整个 Markdown 文档执行全量 `lexer`。当前实现只会重新处理两部分：

- 新增进入稳定态的块
- 当前仍可能继续增长的尾块

这也是整个性能优化的基础。

### 3. 块级局部渲染

每个块会保存自己的 token 树、结构摘要和 HTML 输出。新一轮输入到来后，会只比较前后发生变化的块，并发出最小化 patch：

- `insert`
- `replace`
- `remove`

因此未变更的 DOM 区域可以保持挂载不动，避免长文本全量重绘。

### 4. 全量渲染 API

对于历史记录、消息回放、首屏已有完整 Markdown 内容等场景，项目也提供了正式的全量渲染方法，不需要再手动走 `append + finalize`：

- `renderMarkdownToString(markdown)`
- `renderMarkdown(markdown)`
- `StreamMarkdownRenderer#setMarkdown(markdown)`
- `IncrementalDomRenderer#setMarkdown(markdown)`

### 5. 打字机与光标能力

项目内置了：

- `MarkdownTypewriter`：用于模拟 ChatGPT 风格的流式打字节奏
- `TypewriterCursorController`：用于在 DOM 中显示跟随末尾文本位置的打字光标

并且在代码块输出期间，可以通过 `meta.inCodeFence` 控制光标隐藏。

### 6. 数学公式支持

默认支持以下数学公式分隔符：

- 行内公式：`$...$`、`\(...\)`
- 块级公式：`$$...$$`、`\[...\]`

底层使用 `katex.renderToString` 进行渲染，默认输出 `MathML`。

## 快速开始

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();

renderer.append('# 标题\n\n这是一段');
renderer.append('流式 Markdown。');
renderer.finalize();

console.log(renderer.renderToString());
```

## 全量渲染

### 直接返回 HTML

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('# 历史消息\n\n这是完整内容');
```

### 返回 HTML + blocks + snapshot

```ts
import { renderMarkdown } from 'incremark-renderer';

const result = renderMarkdown('# 历史消息\n\n这是完整内容');

console.log(result.html);
console.log(result.blocks);
console.log(result.snapshot);
```

### 替换已有渲染器内容

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();
renderer.setMarkdown('# 历史记录\n\n一次性加载完成');
```

如果你已经在浏览器里使用 `IncrementalDomRenderer`，也可以直接：

```ts
renderer.setMarkdown(markdown);
```

## 浏览器 DOM 增量渲染

```ts
import { IncrementalDomRenderer } from 'incremark-renderer';

const root = document.getElementById('app')!;
const renderer = new IncrementalDomRenderer(root);

renderer.append('## Hello\n\nPart');
renderer.append('ial render');
renderer.finalize();
```

## Patch 说明

渲染器会输出三种 patch：

- `insert`：新增一个可见块
- `replace`：已有块内容发生变化，需要替换
- `remove`：已有块从可见区域移除

如果一个块发生了结构变化，patch 中还会带上 `astPatches`，用于描述 token 树的变化路径。

## 数学公式用法

### 行内公式

```md
欧拉恒等式：$e^{i\pi} + 1 = 0$
勾股定理：\(a^2 + b^2 = c^2\)
```

### 块级公式

```md
$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

\[
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\]
```

### 错误处理策略

默认情况下，`katex.renderToString` 使用 `throwOnError: true`。

这意味着：

- 公式可正常解析时，输出数学渲染结果
- 如果 KaTeX 抛错，则直接回退显示“原始公式字符串”

例如：

- 输入 `$...$` 出错，则回退显示原始 `$...$`
- 输入 `\(...\)` 出错，则回退显示原始 `\(...\)`
- 输入 `\[...\]` 出错，则回退显示原始 `\[...\]`

### 自定义 KaTeX 配置

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

如果你不希望启用数学公式扩展，也可以关闭：

```ts
const renderer = new StreamMarkdownRenderer({
  math: false,
});
```

## 代码高亮

带语言标记的 fenced code block 默认会启用语法高亮。
渲染结果会输出 `hljs`、`language-*` 以及 `incremark-code-language` 相关结构，方便你在应用层自行接入主题样式。

```ts
import { renderMarkdownToString } from 'incremark-renderer';

const html = renderMarkdownToString('```ts\nconst value = 1;\n```');
```

如果你希望对没有语言标记的代码块做自动识别，可以这样配置：

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer({
  highlight: {
    autoDetect: true,
    languages: ['javascript', 'typescript', 'json'],
  },
});
```

如果你想关闭语法高亮，保留 `marked` 默认代码块输出：

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: false,
});
```

如果你想自定义 `incremark-code-block-header` 区域，比如加复制按钮或其他操作按钮：

```ts
const renderer = new StreamMarkdownRenderer({
  highlight: {
    renderHeader: ({ code, defaultHeaderContent }) => {
      const encoded = encodeURIComponent(code);
      return `${defaultHeaderContent}<button type="button" class="copy-button" data-copy-code="${encoded}">复制</button>`;
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

## 打字机播放

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

如果你已经拿到了完整 Markdown，可以使用 `MarkdownTypewriter` 做回放式打字。
如果是对接真实上游流式输出，请改用 `StreamingMarkdownTypewriter`：

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

### `TypewriterChunkMeta`

`onChunk` 回调里的第二个参数包含：

- `chunk`：当前输出文本片段
- `chunkSize`：当前片段字符数
- `delayMs`：下一次输出前的自适应延迟
- `done`：是否已经输出完成
- `closed`：上游输入是否已经关闭
- `inCodeFence`：当前可见输出是否处于 fenced code block 阶段
- `cursor`：当前输出游标位置
- `total`：当前总文本长度，或流式模式下当前已缓冲文本长度

### `TypewriterEventMeta`

生命周期事件回调会收到 `TypewriterEventMeta`：

- `state`：当前状态，可取 `idle`、`running`、`paused`、`completed`、`stopped`
- `cursor`：当前输出游标位置
- `total`：当前总文本长度，或流式模式下当前已缓冲文本长度
- `closed`：上游输入是否已经结束
- `inCodeFence`：当前可见输出是否处于 fenced code block 阶段
- `lastChunk`：如果这次状态变化由一次真实输出触发，这里会携带最后输出的 chunk

当前支持的打字事件回调：

- `onStart(meta)`
- `onPause(meta)`
- `onResume(meta)`
- `onStop(meta)`
- `onComplete(meta)`
- `onStateChange(meta)`

## Demo

执行：

```bash
npm run demo
```

然后打开：
[http://127.0.0.1:4177/demo/](http://127.0.0.1:4177/demo/)

当前 demo 页可以验证：

- chunk 级流式输入
- 增量 patch 输出
- 块快照与稳定块数量
- 历史消息风格的全量渲染接口
- 数学公式渲染
- ChatGPT 风格打字机节奏
- 打字光标跟随
- 代码块输出期间光标隐藏

## 设计说明

### 1. 稳定块边界检测

当前实现会把输入拆成：

- 已经稳定、不会再变化的前缀块
- 仍可能继续增长的尾块

只有在块边界足够明确时，块才会进入稳定态，从而避免过早冻结列表、段落或代码块。

### 2. AST / Token Diff

项目基于 `marked` 产出的 token 树生成结构摘要，并在更新时做局部比较。目标不是做一个最复杂的 tree-edit 算法，而是以较低开销快速找出应该被局部替换的块。

### 3. DOM 局部更新

内置 `IncrementalDomRenderer` 会优先在 DOM 结构不变时做文本和属性的原地更新；只有结构变化时，才会替换受影响的 `[data-incremark-block]` 节点。

## 扩展点

你可以通过以下方式扩展：

- 自定义 `renderer.renderBlock(block)`
- 使用 `plugins`
- 传入 `marked` 配置
- 传入 `math.katex` 配置
- 使用 `TypewriterCursorController` 自定义光标样式与行为

## 说明

- 当前方案优化重点是“流式输入 + 块级增量更新”，不是完整文档级的全局 AST 优化器。
- 稳定块检测策略偏保守，目的是优先保证流式场景下的正确性与稳定性。
- demo server 主要用于本地验证，不是生产环境静态资源服务器。

## 致谢

本项目在稳定块边界检测思路上参考了开源项目 [kingshuaishuai/incremark](https://github.com/kingshuaishuai/incremark)。
