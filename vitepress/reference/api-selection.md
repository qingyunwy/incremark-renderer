# API 选型

## 速览

| 需求 | 推荐 API | 说明 |
| --- | --- | --- |
| 需要在任意 JavaScript 运行时里增量处理 Markdown | `StreamMarkdownRenderer` | 不依赖 DOM，适合 SSR、Worker、适配层 |
| 需要直接把流式 Markdown 应用到浏览器 DOM | `IncrementalDomRenderer` | 浏览器专用，适合已有 root 的局部更新 |
| 需要浏览器打字机播放和光标控制 | `StreamingMarkdownController` | 高层封装，适合完整消息播放效果 |
| 已有完整字符串，只想做打字机回放 | `MarkdownTypewriter` | 无 DOM 依赖 |
| 上游文本会持续到达，需要独立控制播放节奏 | `StreamingMarkdownTypewriter` | 无 DOM 依赖，可自行接渲染逻辑 |

## `StreamMarkdownRenderer`

适合：

- 服务端预处理
- 框架适配层
- 想自己消费 `blocks`、`snapshot` 和 `patches`

不适合：

- 直接操作浏览器 DOM

## `IncrementalDomRenderer`

适合：

- 已经有 root 容器
- 只关心浏览器局部更新
- 不需要内置打字机节奏

补充：

- 现在支持 `attach(root)` / `mount(root)`
- 可以先 headless 地积累渲染状态，再在需要时绑定 DOM

## `StreamingMarkdownController`

适合：

- 浏览器消息答复区域
- 想直接获得打字机播放、DOM 更新、光标处理
- SSE / WebSocket 文本流直接接 UI

补充：

- 支持 `attach(root)` / `mount(root)`
- root 晚到时可以先 `push()`，后续再挂载

## `StreamingMarkdownTypewriter`

适合：

- 你想完全掌握渲染层
- 只需要节奏控制和 code fence 状态
- 想把播放和渲染拆成独立层

典型组合：

```ts
const renderer = new IncrementalDomRenderer(root);
const typewriter = new StreamingMarkdownTypewriter({
  onChunk: (chunk) => {
    renderer.append(chunk);
  },
  onComplete: () => {
    renderer.finalize();
  },
});
```
