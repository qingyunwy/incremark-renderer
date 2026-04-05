# 快速开始

`incremark-renderer` 是一个基于 `marked.js` 的流式 Markdown 渲染器，重点解决“文本一边到达、一边渲染”时的性能与稳定性问题。

## 安装

```bash
npm install incremark-renderer
```

## 运行环境矩阵

| 场景 | 推荐 API | 是否依赖 DOM |
| --- | --- | --- |
| 在 Node.js / Worker / SSR 中做流式处理 | `StreamMarkdownRenderer` | 否 |
| 直接把流式 Markdown 渲染到浏览器 DOM | `IncrementalDomRenderer` | 是 |
| 浏览器侧需要打字机播放和光标 | `StreamingMarkdownController` | 是 |
| 已拿到完整 Markdown，只需要回放 | `MarkdownTypewriter` | 否 |
| 上游是实时 SSE / WebSocket 文本流 | `StreamingMarkdownTypewriter` | 否 |

## 第一个例子：纯流式渲染

```ts
import { StreamMarkdownRenderer } from 'incremark-renderer';

const renderer = new StreamMarkdownRenderer();

renderer.append('# Hello\n\nThis is');
renderer.append(' streaming Markdown.');
renderer.finalize();

console.log(renderer.renderToString());
console.log(renderer.getSnapshot());
```

## 浏览器里直接更新 DOM

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

## 浏览器流式打字机

```ts
import { StreamingMarkdownController } from 'incremark-renderer';

const root = document.getElementById('answer');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #answer root element.');
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

## 延迟挂载 root 的场景

如果消息容器会晚于首个 chunk 才挂到页面上，可以先在 headless 状态下累计文本，等 root 就绪后再挂载：

```ts
const controller = new StreamingMarkdownController({
  autoStart: false,
});

controller.push('First chunk');
controller.push(' second chunk');

controller.attach(root);
controller.start();
```

`IncrementalDomRenderer` 同样支持 `attach(root)` / `mount(root)`，适合框架组件先持有渲染状态、后绑定 DOM 的场景。
