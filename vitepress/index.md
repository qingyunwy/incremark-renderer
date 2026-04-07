---
layout: home

hero:
  name: incremark-renderer
  text: 流式 Markdown 增量渲染器
  tagline: 面向聊天界面、LLM 产品和实时内容场景，按稳定块增量解析并局部更新 DOM。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 在线演示
      link: /demo
    - theme: alt
      text: GitHub
      link: https://github.com/qingyunwy/incremark-renderer

features:
  - title: 增量而不是全量重刷
    details: "只重新处理新增稳定块和当前 mutable tail，避免每个 chunk 都重跑整篇 Markdown。"
  - title: DOM 更新可控
    details: "渲染结果以 block 为单位产出 patch，浏览器侧可以只替换真正变化的块。"
  - title: 生产能力完整
    details: "内置代码高亮、数学公式、::: 容器、HTML 安全清洗、打字机节奏和光标控制。"
  - title: 对框架接入友好
    details: "可在 Vue / React 组件中只监听 text 增量，在组件内部维护 controller 与 root 生命周期。"
---

<div class="lead">
  这份站点面向真实项目接入而写，不只覆盖 API 说明，也把 GitHub Pages 的部署、文档站内 demo 承载、以及浏览器流式集成的落地方式一起整理好了。
</div>

## 你会在这里看到什么

<div class="doc-grid">
  <div class="doc-card">
    <h3>快速开始</h3>
    <p>用最短路径完成安装、首个流式渲染和浏览器接入。</p>
  </div>
  <div class="doc-card">
    <h3>核心概念</h3>
    <p>理解 stable blocks、mutable tail 和 block-level patches 的设计动机。</p>
  </div>
  <div class="doc-card">
    <h3>浏览器集成</h3>
    <p>从原生 DOM 到 Vue / React 组件封装，覆盖常见的流式消息 UI 时序。</p>
  </div>
  <div class="doc-card">
    <h3>在线演示</h3>
    <p>直接在文档站里打开 playground 和对比页，观察渲染、patch 和性能表现。</p>
  </div>
</div>

## 推荐阅读顺序

1. 先看 [快速开始](/guide/getting-started)，确认你应该用哪个 API。
2. 再看 [核心概念](/guide/core-concepts)，理解为什么它不会在每个 chunk 上全量重跑。
3. 如果你要接到浏览器消息流，继续看 [浏览器集成](/guide/browser-integration)。
4. 想直接体验效果，可以马上打开 [在线演示](/demo)。

## 适合哪些场景

- 聊天界面和 AI 助手答复面板
- 需要实时播放 Markdown 的日志、报告或协作文档
- 希望保留 `marked.js` 生态，同时减少流式 UI 闪烁和重排
- 需要自定义容器、代码块样式、安全清洗策略的前端项目
