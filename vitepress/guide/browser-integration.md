# 浏览器集成

## 原生 DOM 场景

如果你已经拿到了消息容器的 root，最直接的接法就是 `StreamingMarkdownController`：

```ts
const controller = new StreamingMarkdownController(root, {
  renderer: {
    highlight: {
      showLineNumbers: true,
    },
  },
});

stream.on('data', (chunk) => {
  controller.push(chunk);
});

stream.on('end', () => {
  controller.close();
});
```

## Vue / React 组件封装

实际项目里更稳的方式，通常是封装一个消息组件：

- 组件挂载时，root 一定存在
- 组件内部创建一次 controller
- 外部只传 `text` 和 `done`
- 组件内部比对上一次 `text`，只把新增 delta `push()` 给 controller

这种方式可以天然避开“先收到 SSE，后拿到 root”的时序问题。

## 组件内的推荐状态

- `controllerRef`：只创建一次
- `prevTextRef`：记录上一次已经消费的文本
- `doneRef`：避免重复 `close()`

当 `text` 变长时，提取 `delta = text.slice(prevText.length)` 并 `push(delta)`。

当 `text` 被整体替换、回退或重放时，建议：

1. `controller.reset()`
2. `prevTextRef = ''`
3. 按新的完整文本重新灌入

## 何时用 attach / mount

如果你的业务层需要先开始累计流，再等组件真正进入 DOM，`attach(root)` / `mount(root)` 很适合：

```ts
const controller = new StreamingMarkdownController({
  autoStart: false,
});

controller.push(firstChunk);
controller.push(secondChunk);

controller.attach(root);
controller.start();
```

这套 API 更适合：

- 消息列表虚拟化
- 延迟插入的答复卡片
- 复杂容器动画之后才真正出现在文档流中的内容

## 自动滚动和光标

内置光标适合“打字机效果明显”的场景；如果你更关注纯渲染稳定性，可以把 `cursor` 设为 `false`。

```ts
const controller = new StreamingMarkdownController(root, {
  cursor: false,
});
```

这样通常会更贴近生产聊天界面，尤其是在已有自定义 loading 光标或统一滚动策略时。
