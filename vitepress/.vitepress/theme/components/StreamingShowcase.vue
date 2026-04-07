<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { StreamingMarkdownController } from '../../../../dist/index.js';

const DEFAULT_MARKDOWN = `# Incremark Renderer Streaming Showcase

这段默认输入模拟的是一个“聊天答复 / 插件面板 / 实时内容卡片”的流式 Markdown 输出。

你可以直接点击开始播放，观察标题、段落、列表、容器、代码块、公式、表格如何按 stable blocks 增量渲染。

访问文档时可以继续参考 [快速开始](/guide/getting-started) 和 [浏览器集成](/guide/browser-integration)。

## 覆盖的测试样例

- 标题、段落、强调、行内代码与链接
- 有序列表、无序列表、引用块
- \`:::\` 容器与 \`thinking\` 折叠面板
- fenced code block、代码头部按钮、行号
- 行内公式、块级公式、表格

## 典型接入场景

1. 聊天界面里的 AI 回答逐字播放
2. 插件面板里的结构化 Markdown 卡片
3. 报告、日志、分析结果的增量更新

> 目标不是“每个 chunk 全量重刷”，而是在内容持续到达时，只重算新增稳定块和当前 mutable tail。

:::note 插件面板设定
这个 demo 默认模拟一个插件输出面板：

- 上半区输入 Markdown
- 下半区展示增量渲染结果
- 代码块带复制按钮与行号

你可以把容器类型改成 \`tip\`、\`warning\` 或 \`success\`，快速验证不同 callout 样式。
:::

:::tip Render Hooks
演示页当前启用了几类常见扩展点：

- \`container.render\` 自定义 callout / thinking 外层结构
- \`highlight.renderHeader\` 注入 Copy 按钮
- \`showLineNumbers\` 为 fenced code block 添加 gutter
:::

:::warning 流式边界测试
下面这个代码块里的 \`:::\` 只是普通文本，不应该被误判成容器结束标记：

\`\`\`md
:::note Draft Panel
streaming body
:::
\`\`\`
:::

:::thinking Token Stream Trace
step 1: receive delta text from model or plugin
step 2: keep unfinished container and fence lines inside mutable tail
step 3: once closing markers arrive, stabilize the block and patch only the changed DOM
:::

## 代码块与行号

\`\`\`ts
export function renderPluginMessage(root: HTMLElement, markdown: string) {
  const controller = new StreamingMarkdownController(root, {
    cursor: { variant: 'circle' },
    typewriter: { baseDelayMs: 14, minChunkSize: 1, maxChunkSize: 3 },
  });

  controller.push(markdown);
  controller.close();
}
\`\`\`

## 列表、引用与行内语法

- **粗体** 用来强调关键能力
- *斜体* 可以表示状态或阶段
- \`inline code\` 适合标识 API、字段和配置项
- 链接可以指向 [GitHub](https://github.com/qingyunwy/incremark-renderer)

1. 先识别 stable blocks
2. 再重绘 mutable tail
3. 最后仅对变化块执行 patch

> 如果围栏代码块或容器还没闭合，渲染器会保留它们的“进行中”状态，而不是过早稳定。

## 数学公式

行内公式示例：$E = mc^2$，以及 \\(a^2 + b^2 = c^2\\)。

块级公式：

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

## 表格

| 场景 | 输入特征 | 预期行为 |
| --- | --- | --- |
| 普通段落 | 文本持续追加 | replace 当前 tail |
| 容器块 | \`:::\` 尚未闭合 | 保持 open 状态 |
| 代码块 | 围栏未结束 | 不提前稳定 |
| 已完成块 | 结构闭合完成 | insert stable block |
`;

type ThinkingStatus = 'running' | 'completed' | 'aborted';
type CursorVariantSetting = 'none' | 'bar' | 'circle';

const THINKING_STATUS_LABELS: Record<ThinkingStatus, string> = {
  running: '正在思考',
  completed: '思考完成',
  aborted: '思考中止',
};

const source = ref(DEFAULT_MARKDOWN);
const previewRoot = ref<HTMLElement | null>(null);
const controller = shallowRef<StreamingMarkdownController | null>(null);
const playbackState = ref<'idle' | 'running' | 'completed'>('idle');
const cursorVariant = ref<CursorVariantSetting>('circle');
const baseDelayMs = ref(14);
const maxChunkSize = ref(3);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeClassNameSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'default';
}

function getThinkingFingerprint(type: string, title?: string): string {
  return `${type}::${title ?? ''}`;
}

function getThinkingExpandedPreference(fingerprint: string): boolean {
  const root = previewRoot.value;
  if (!root) {
    return true;
  }

  for (const node of root.querySelectorAll<HTMLElement>('[data-thinking-shell]')) {
    if (node.dataset.thinkingFingerprint === fingerprint) {
      return node.dataset.thinkingExpanded !== 'false';
    }
  }

  return true;
}

function renderThinkingContainer(context: {
  type: string;
  title?: string;
  text: string;
  closed: boolean;
}): string {
  const safeType = escapeHtml(context.type);
  const safeTitle = context.title ? escapeHtml(context.title) : '';
  const fingerprint = getThinkingFingerprint(context.type, context.title);
  const expanded = getThinkingExpandedPreference(fingerprint);
  const statusLabel = context.closed
    ? THINKING_STATUS_LABELS.completed
    : THINKING_STATUS_LABELS.running;

  return `<section class="demo-thinking" data-thinking-shell data-thinking-type="${safeType}" data-thinking-title="${safeTitle}" data-thinking-fingerprint="${escapeHtml(fingerprint)}" data-thinking-expanded="${String(expanded)}" data-thinking-closed="${String(context.closed)}"><button type="button" class="demo-thinking-toggle" data-thinking-toggle aria-expanded="${String(expanded)}"><span class="demo-thinking-toggle-copy"><span class="demo-thinking-chip">${safeType}</span>${context.title ? `<strong class="demo-thinking-title">${safeTitle}</strong>` : ''}</span><span class="demo-thinking-meta"><span class="demo-thinking-status" data-thinking-status-text>${statusLabel}</span><span class="demo-thinking-toggle-label" data-thinking-toggle-label>${expanded ? '折叠' : '展开'}</span><span class="demo-thinking-chevron" aria-hidden="true"></span></span></button><div class="demo-thinking-body" data-thinking-body><pre class="demo-thinking-text">${escapeHtml(context.text)}</pre></div></section>`;
}

function renderDemoContainer(context: {
  type: string;
  title?: string;
  innerHtml: string;
  text: string;
  closed: boolean;
}): string {
  if (context.type === 'thinking') {
    return renderThinkingContainer(context);
  }

  const safeType = escapeHtml(context.type);
  const safeTitle = context.title
    ? `<strong class="demo-callout-title">${escapeHtml(context.title)}</strong>`
    : '';

  return `<aside class="demo-callout demo-callout-${sanitizeClassNameSegment(context.type)}" data-demo-callout="${safeType}"><div class="demo-callout-head"><span class="demo-callout-chip">${safeType}</span>${safeTitle}</div><div class="demo-callout-body">${context.innerHtml}</div></aside>`;
}

function createRendererOptions() {
  return {
    container: {
      render: renderDemoContainer,
    },
    highlight: {
      showLineNumbers: true,
      renderHeader: ({ code, defaultHeaderContent }: { code: string; defaultHeaderContent: string }) => {
        const encodedCode = encodeURIComponent(code);
        return `${defaultHeaderContent}<button type="button" class="incremark-code-action" data-copy-code="${encodedCode}">Copy</button>`;
      },
    },
  };
}

function getCursorOptions() {
  if (cursorVariant.value === 'none') {
    return false;
  }

  return {
    variant: cursorVariant.value,
  } as const;
}

function getBaseDelayMs(): number {
  return Math.max(8, Number.isFinite(baseDelayMs.value) ? Math.round(baseDelayMs.value) : 14);
}

function getMaxChunkSize(): number {
  const value = Number.isFinite(maxChunkSize.value) ? Math.round(maxChunkSize.value) : 3;
  return Math.max(1, Math.min(12, value));
}

function setThinkingExpanded(shell: HTMLElement, expanded: boolean): void {
  shell.dataset.thinkingExpanded = String(expanded);

  const toggle = shell.querySelector('[data-thinking-toggle]');
  if (toggle instanceof HTMLButtonElement) {
    toggle.setAttribute('aria-expanded', String(expanded));
  }

  const toggleLabel = shell.querySelector('[data-thinking-toggle-label]');
  if (toggleLabel instanceof HTMLElement) {
    toggleLabel.textContent = expanded ? '折叠' : '展开';
  }
}

function getThinkingStatus(shell: HTMLElement): ThinkingStatus {
  const isClosed = shell.dataset.thinkingClosed === 'true';

  if (isClosed) {
    return 'completed';
  }

  if (playbackState.value === 'completed') {
    return 'aborted';
  }

  return 'running';
}

function syncThinkingPanels(): void {
  const root = previewRoot.value;
  if (!root) {
    return;
  }

  root.querySelectorAll<HTMLElement>('[data-thinking-shell]').forEach((node) => {
    const status = getThinkingStatus(node);
    node.dataset.thinkingStatus = status;

    const statusText = node.querySelector('[data-thinking-status-text]');
    if (statusText instanceof HTMLElement) {
      statusText.textContent = THINKING_STATUS_LABELS[status];
    }

    const expanded = node.dataset.thinkingExpanded !== 'false';
    setThinkingExpanded(node, expanded);
  });
}

async function handlePreviewClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const thinkingToggle = target.closest('[data-thinking-toggle]');
  if (thinkingToggle instanceof HTMLButtonElement) {
    const shell = thinkingToggle.closest('[data-thinking-shell]');
    if (!(shell instanceof HTMLElement)) {
      return;
    }

    const nextExpanded = shell.dataset.thinkingExpanded !== 'true';
    setThinkingExpanded(shell, nextExpanded);
    return;
  }

  const copyButton = target.closest('[data-copy-code]');
  if (!(copyButton instanceof HTMLButtonElement)) {
    return;
  }

  const encodedCode = copyButton.dataset.copyCode;
  if (!encodedCode) {
    return;
  }

  const previousLabel = copyButton.textContent ?? 'Copy';

  try {
    await navigator.clipboard.writeText(decodeURIComponent(encodedCode));
    copyButton.textContent = 'Copied';
  } catch {
    copyButton.textContent = 'Failed';
  }

  window.setTimeout(() => {
    if (copyButton.isConnected) {
      copyButton.textContent = previousLabel;
    }
  }, 1200);
}

function createControllerInstance(): StreamingMarkdownController | null {
  if (!previewRoot.value) {
    return null;
  }

  return new StreamingMarkdownController(previewRoot.value, {
    cursor: getCursorOptions(),
    renderer: createRendererOptions(),
    typewriter: {
      baseDelayMs: getBaseDelayMs(),
      minChunkSize: 1,
      maxChunkSize: getMaxChunkSize(),
    },
    onChunk: () => {
      playbackState.value = 'running';
      syncThinkingPanels();
    },
    onComplete: () => {
      playbackState.value = 'completed';
      syncThinkingPanels();
    },
  });
}

function recreateController(): void {
  controller.value?.destroy();
  controller.value = null;

  if (previewRoot.value) {
    previewRoot.value.innerHTML = '';
  }

  controller.value = createControllerInstance();
}

function resetDemo(): void {
  playbackState.value = 'idle';
  recreateController();
}

function playDemo(): void {
  if (source.value.trim().length === 0) {
    return;
  }

  playbackState.value = 'idle';
  recreateController();
  controller.value?.push(source.value);
  controller.value?.close();
}

onMounted(() => {
  controller.value = createControllerInstance();
});

onBeforeUnmount(() => {
  controller.value?.destroy();
  controller.value = null;
});
</script>

<template>
  <section class="stream-showcase">
    <header class="stream-showcase__header">
      <div>
        <p class="stream-showcase__eyebrow">Live Demo</p>
        <h2 class="stream-showcase__title">流式渲染效果演示</h2>
        <p class="stream-showcase__description">
          输入一段 Markdown，调整配置后点击开始播放，即可查看与项目根目录 demo 相同风格的流式渲染结果。
        </p>
      </div>
    </header>

    <label class="stream-showcase__composer">
      <span class="stream-showcase__panel-title">Markdown Input</span>
      <textarea v-model="source" class="stream-showcase__textarea" />
    </label>

    <div class="stream-showcase__controls">
      <label class="stream-showcase__field">
        <span>光标样式</span>
        <select v-model="cursorVariant" class="stream-showcase__select">
          <option value="none">None 无光标</option>
          <option value="bar">Bar 条形</option>
          <option value="circle">Circle 小球</option>
        </select>
      </label>
      <label class="stream-showcase__field">
        <span>打字延迟（ms）</span>
        <input v-model.number="baseDelayMs" class="stream-showcase__input" type="number" min="8" step="2" />
      </label>
      <label class="stream-showcase__field">
        <span>每次输出最大字符数</span>
        <input v-model.number="maxChunkSize" class="stream-showcase__input" type="number" min="1" max="12" />
      </label>
    </div>

    <div class="stream-showcase__actions">
      <button class="stream-showcase__action is-primary" type="button" @click="playDemo">
        开始播放
      </button>
      <button class="stream-showcase__action" type="button" @click="resetDemo">
        清空结果
      </button>
    </div>

    <section class="stream-showcase__panel">
      <span class="stream-showcase__panel-title">Rendered Preview</span>
      <div
        ref="previewRoot"
        class="stream-showcase__preview"
        @click="handlePreviewClick"
      />
    </section>
  </section>
</template>

<style scoped>
.stream-showcase {
  --stream-shell-bg:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 241, 235, 0.94)),
    radial-gradient(circle at top right, rgba(196, 91, 45, 0.12), transparent 36%);
  --stream-shell-shadow: 0 26px 60px rgba(77, 53, 35, 0.12);
  --stream-panel-border: rgba(31, 36, 48, 0.08);
  --stream-panel-bg: rgba(255, 255, 255, 0.74);
  --stream-surface-border: rgba(31, 36, 48, 0.08);
  --stream-surface-bg: rgba(255, 252, 248, 0.94);
  --stream-control-border: rgba(31, 36, 48, 0.12);
  --stream-control-bg: rgba(255, 255, 255, 0.9);
  --stream-action-border: rgba(31, 36, 48, 0.1);
  --stream-action-bg: rgba(255, 255, 255, 0.9);
  --stream-callout-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.52)),
    var(--callout-soft);
  --stream-callout-shadow: 0 14px 32px rgba(77, 53, 35, 0.08);
  --stream-callout-chip-bg: rgba(255, 255, 255, 0.72);
  --stream-callout-edge-fade: rgba(255, 255, 255, 0.82);
  --stream-thinking-bg:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.68)),
    var(--thinking-soft);
  --stream-thinking-shadow: 0 14px 32px rgba(77, 53, 35, 0.08);
  --stream-thinking-toggle-border: rgba(31, 36, 48, 0.08);
  --stream-thinking-toggle-hover: rgba(255, 255, 255, 0.28);
  --stream-thinking-chip-bg: rgba(255, 255, 255, 0.74);
  --stream-thinking-chevron: rgba(31, 36, 48, 0.55);
  --stream-thinking-text: #28313a;
  --stream-quote-border: rgba(196, 91, 45, 0.35);
  --stream-table-border: rgba(31, 36, 48, 0.12);
  color-scheme: light;
  margin: 24px 0 36px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 28px;
  background: var(--stream-shell-bg);
  box-shadow: var(--stream-shell-shadow);
}

:global(html.dark .stream-showcase) {
  --stream-shell-bg:
    linear-gradient(180deg, rgba(25, 31, 42, 0.96), rgba(15, 20, 29, 0.96)),
    radial-gradient(circle at top right, rgba(196, 91, 45, 0.18), transparent 42%);
  --stream-shell-shadow: 0 28px 72px rgba(0, 0, 0, 0.34);
  --stream-panel-border: rgba(148, 163, 184, 0.16);
  --stream-panel-bg: rgba(20, 26, 36, 0.82);
  --stream-surface-border: rgba(148, 163, 184, 0.16);
  --stream-surface-bg: rgba(10, 15, 24, 0.9);
  --stream-control-border: rgba(148, 163, 184, 0.2);
  --stream-control-bg: rgba(32, 40, 53, 0.9);
  --stream-action-border: rgba(148, 163, 184, 0.18);
  --stream-action-bg: rgba(32, 40, 53, 0.92);
  --stream-callout-bg:
    linear-gradient(135deg, rgba(31, 39, 53, 0.88), rgba(17, 24, 35, 0.82)),
    var(--callout-soft);
  --stream-callout-shadow: 0 16px 38px rgba(0, 0, 0, 0.26);
  --stream-callout-chip-bg: rgba(255, 255, 255, 0.08);
  --stream-callout-edge-fade: rgba(255, 255, 255, 0.22);
  --stream-thinking-bg:
    linear-gradient(180deg, rgba(30, 38, 52, 0.88), rgba(18, 25, 36, 0.84)),
    var(--thinking-soft);
  --stream-thinking-shadow: 0 16px 38px rgba(0, 0, 0, 0.28);
  --stream-thinking-toggle-border: rgba(148, 163, 184, 0.14);
  --stream-thinking-toggle-hover: rgba(255, 255, 255, 0.05);
  --stream-thinking-chip-bg: rgba(255, 255, 255, 0.08);
  --stream-thinking-chevron: rgba(226, 232, 240, 0.72);
  --stream-thinking-text: rgba(241, 245, 249, 0.92);
  --stream-quote-border: rgba(215, 121, 52, 0.48);
  --stream-table-border: rgba(148, 163, 184, 0.18);
  color-scheme: dark;
}

.stream-showcase__header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.stream-showcase__eyebrow {
  margin: 0 0 8px;
  color: var(--vp-c-brand-1);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.stream-showcase__title {
  margin: 0;
  font-size: 1.5rem;
}

.stream-showcase__description {
  max-width: 760px;
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.stream-showcase__composer,
.stream-showcase__panel {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding: 18px;
  border: 1px solid var(--stream-panel-border);
  border-radius: 22px;
  background: var(--stream-panel-bg);
}

.stream-showcase__panel-title,
.stream-showcase__field span {
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  font-weight: 700;
}

.stream-showcase__textarea,
.stream-showcase__preview {
  min-height: 520px;
  border: 1px solid var(--stream-surface-border);
  border-radius: 18px;
  background: var(--stream-surface-bg);
}

.stream-showcase__textarea {
  width: 100%;
  padding: 16px;
  resize: vertical;
  color: var(--vp-c-text-1);
  caret-color: var(--vp-c-brand-1);
  font: inherit;
  line-height: 1.6;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
}

.stream-showcase__controls,
.stream-showcase__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.stream-showcase__field {
  display: grid;
  gap: 6px;
  min-width: 180px;
}

.stream-showcase__input,
.stream-showcase__select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--stream-control-border);
  border-radius: 16px;
  background: var(--stream-control-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}

.stream-showcase__action {
  min-width: 120px;
  padding: 12px 18px;
  border: 1px solid var(--stream-action-border);
  border-radius: 999px;
  background: var(--stream-action-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.stream-showcase__action.is-primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, #c45b2d 0%, #dd8b2d 100%);
}

.stream-showcase__preview {
  position: relative;
  overflow: auto;
  padding: 18px 20px;
  line-height: 1.7;
}

.stream-showcase__preview :deep([data-incremark-block] + [data-incremark-block]) {
  margin-top: 12px;
}

.stream-showcase__preview :deep(pre) {
  overflow: auto;
  margin: 0;
  padding: 14px;
  border-radius: 16px;
  background: #1f2430;
  color: #f7f2ea;
}

.stream-showcase__preview :deep(.incremark-code-block) {
  overflow: hidden;
  border-radius: 16px;
  background: #1f2430;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.stream-showcase__preview :deep(.incremark-code-block-header) {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 2.2rem;
  padding: 0.5rem 0.8rem 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)),
    #1f2430;
}

.stream-showcase__preview :deep(.incremark-code-language) {
  display: inline-flex;
  align-items: center;
  margin-right: auto;
  padding: 0.16rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: #c8d1df;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
}

.stream-showcase__preview :deep(.incremark-code-action) {
  min-width: 0;
  padding: 0.24rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #f7f2ea;
  font-size: 0.72rem;
  line-height: 1.2;
  box-shadow: none;
}

.stream-showcase__preview :deep(.incremark-code-action:hover) {
  transform: none;
  background: rgba(255, 255, 255, 0.14);
}

.stream-showcase__preview :deep(.incremark-code-block pre) {
  border-radius: 0;
  box-shadow: none;
}

.stream-showcase__preview :deep(.incremark-code-block .incremark-code-pre-with-lines) {
  --incremark-code-line-height: 1.6;
  padding: 12px 0;
}

.stream-showcase__preview :deep(.incremark-code-block .incremark-code-pre-with-lines code) {
  display: block;
  font-size: inherit;
  line-height: var(--incremark-code-line-height);
}

.stream-showcase__preview :deep(.incremark-code-grid) {
  display: grid;
  grid-template-columns: minmax(2.4ch, auto) minmax(0, 1fr);
  align-items: start;
  min-width: 100%;
  width: max-content;
}

.stream-showcase__preview :deep(.incremark-code-gutter) {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: sticky;
  left: 0;
  z-index: 1;
  padding: 0 0 0 14px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #1f2430;
}

.stream-showcase__preview :deep(.incremark-code-line-number) {
  display: block;
  min-width: 2.4ch;
  padding: 0 12px 0 0;
  color: #7a8394;
  line-height: var(--incremark-code-line-height);
  text-align: right;
  user-select: none;
}

.stream-showcase__preview :deep(.incremark-code-content) {
  display: block;
  min-width: 0;
  padding: 0 14px;
  line-height: var(--incremark-code-line-height);
  white-space: pre;
}

.stream-showcase__preview :deep(pre code) {
  display: block;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
}

.stream-showcase__preview :deep(.hljs) {
  color: #f7f2ea;
  background: transparent;
}

.stream-showcase__preview :deep(.hljs-comment),
.stream-showcase__preview :deep(.hljs-quote) {
  color: #7a8394;
}

.stream-showcase__preview :deep(.hljs-keyword),
.stream-showcase__preview :deep(.hljs-selector-tag),
.stream-showcase__preview :deep(.hljs-literal),
.stream-showcase__preview :deep(.hljs-name) {
  color: #ffad66;
}

.stream-showcase__preview :deep(.hljs-title),
.stream-showcase__preview :deep(.hljs-title.class_),
.stream-showcase__preview :deep(.hljs-title.function_),
.stream-showcase__preview :deep(.hljs-attribute),
.stream-showcase__preview :deep(.hljs-property) {
  color: #ffd173;
}

.stream-showcase__preview :deep(.hljs-string),
.stream-showcase__preview :deep(.hljs-regexp),
.stream-showcase__preview :deep(.hljs-meta .hljs-string) {
  color: #aad94c;
}

.stream-showcase__preview :deep(.hljs-number),
.stream-showcase__preview :deep(.hljs-symbol),
.stream-showcase__preview :deep(.hljs-bullet) {
  color: #f28779;
}

.stream-showcase__preview :deep(.hljs-variable),
.stream-showcase__preview :deep(.hljs-template-variable),
.stream-showcase__preview :deep(.hljs-subst),
.stream-showcase__preview :deep(.hljs-operator) {
  color: #73d0ff;
}

.stream-showcase__preview :deep(.hljs-built_in),
.stream-showcase__preview :deep(.hljs-type),
.stream-showcase__preview :deep(.hljs-meta),
.stream-showcase__preview :deep(.hljs-doctag) {
  color: #5ccfe6;
}

.stream-showcase__preview :deep(.demo-callout) {
  --callout-accent: #227d70;
  --callout-soft: rgba(34, 125, 112, 0.12);
  position: relative;
  overflow: hidden;
  padding: 16px 18px;
  border: 1px solid rgba(34, 125, 112, 0.18);
  border-radius: 20px;
  background: var(--stream-callout-bg);
  box-shadow: var(--stream-callout-shadow);
}

.stream-showcase__preview :deep(.demo-callout::before) {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: linear-gradient(180deg, var(--callout-accent) 0%, var(--stream-callout-edge-fade) 100%);
}

.stream-showcase__preview :deep(.demo-callout-head) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.stream-showcase__preview :deep(.demo-callout-chip) {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.58rem;
  border-radius: 999px;
  background: var(--stream-callout-chip-bg);
  color: var(--callout-accent);
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stream-showcase__preview :deep(.demo-callout-title) {
  font-size: 1rem;
  line-height: 1.3;
}

.stream-showcase__preview :deep(.demo-callout-body > :first-child) {
  margin-top: 0;
}

.stream-showcase__preview :deep(.demo-callout-body > :last-child) {
  margin-bottom: 0;
}

.stream-showcase__preview :deep(.demo-callout-body .incremark-code-block) {
  margin-top: 12px;
}

.stream-showcase__preview :deep(.demo-callout-tip) {
  --callout-accent: #3a69b7;
  --callout-soft: rgba(58, 105, 183, 0.12);
  border-color: rgba(58, 105, 183, 0.2);
}

.stream-showcase__preview :deep(.demo-callout-warning) {
  --callout-accent: #c45b2d;
  --callout-soft: rgba(196, 91, 45, 0.14);
  border-color: rgba(196, 91, 45, 0.22);
}

.stream-showcase__preview :deep(.demo-callout-success) {
  --callout-accent: #3d8f57;
  --callout-soft: rgba(61, 143, 87, 0.14);
  border-color: rgba(61, 143, 87, 0.22);
}

.stream-showcase__preview :deep(.demo-thinking) {
  --thinking-accent: #c45b2d;
  --thinking-soft: rgba(196, 91, 45, 0.12);
  overflow: hidden;
  border: 1px solid rgba(196, 91, 45, 0.2);
  border-radius: 20px;
  background: var(--stream-thinking-bg);
  box-shadow: var(--stream-thinking-shadow);
}

.stream-showcase__preview :deep(.demo-thinking[data-thinking-status="completed"]) {
  --thinking-accent: #3d8f57;
  --thinking-soft: rgba(61, 143, 87, 0.12);
  border-color: rgba(61, 143, 87, 0.2);
}

.stream-showcase__preview :deep(.demo-thinking[data-thinking-status="aborted"]) {
  --thinking-accent: #8b4a3f;
  --thinking-soft: rgba(139, 74, 63, 0.12);
  border-color: rgba(139, 74, 63, 0.2);
}

.stream-showcase__preview :deep(.demo-thinking-toggle) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 15px 18px;
  border: 0;
  border-bottom: 1px solid var(--stream-thinking-toggle-border);
  border-radius: 0;
  background: transparent;
  color: inherit;
  box-shadow: none;
}

.stream-showcase__preview :deep(.demo-thinking-toggle:hover) {
  transform: none;
  background: var(--stream-thinking-toggle-hover);
}

.stream-showcase__preview :deep(.demo-thinking-toggle-copy),
.stream-showcase__preview :deep(.demo-thinking-meta) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stream-showcase__preview :deep(.demo-thinking-meta) {
  flex-shrink: 0;
}

.stream-showcase__preview :deep(.demo-thinking-chip) {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.58rem;
  border-radius: 999px;
  background: var(--stream-thinking-chip-bg);
  color: var(--thinking-accent);
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stream-showcase__preview :deep(.demo-thinking-title) {
  min-width: 0;
  font-size: 0.98rem;
  line-height: 1.35;
  text-align: left;
}

.stream-showcase__preview :deep(.demo-thinking-status),
.stream-showcase__preview :deep(.demo-thinking-toggle-label) {
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
}

.stream-showcase__preview :deep(.demo-thinking-status) {
  color: var(--thinking-accent);
}

.stream-showcase__preview :deep(.demo-thinking-chevron) {
  width: 10px;
  height: 10px;
  border-right: 2px solid var(--stream-thinking-chevron);
  border-bottom: 2px solid var(--stream-thinking-chevron);
  transform: rotate(45deg);
  transition: transform 160ms ease;
}

.stream-showcase__preview :deep(.demo-thinking[data-thinking-expanded="false"] .demo-thinking-chevron) {
  transform: rotate(-45deg);
}

.stream-showcase__preview :deep(.demo-thinking[data-thinking-expanded="false"] .demo-thinking-body) {
  display: none;
}

.stream-showcase__preview :deep(.demo-thinking-body) {
  padding: 0 18px 18px;
}

.stream-showcase__preview :deep(.demo-thinking-text) {
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--stream-thinking-text);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92rem;
  line-height: 1.7;
}

.stream-showcase__preview :deep(blockquote) {
  margin: 0;
  padding-left: 16px;
  border-left: 4px solid var(--stream-quote-border);
  color: var(--vp-c-text-2);
}

.stream-showcase__preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.stream-showcase__preview :deep(.incremark-math-inline) {
  display: inline-flex;
  align-items: center;
  padding: 0 0.12em;
}

.stream-showcase__preview :deep(.incremark-math-block) {
  overflow-x: auto;
  padding: 12px 0;
}

.stream-showcase__preview :deep(.incremark-math-error) {
  color: #b42318;
}

.stream-showcase__preview :deep(.incremark-typewriter-cursor) {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  border-radius: 999px;
  background: linear-gradient(180deg, #c45b2d 0%, #f2b15a 100%);
  box-shadow: 0 0 0 1px rgba(196, 91, 45, 0.12), 0 0 18px rgba(196, 91, 45, 0.25);
  pointer-events: none;
  animation: stream-showcase-cursor-blink 1s steps(1) infinite;
  transition: transform 90ms linear, width 90ms linear, height 90ms linear;
}

.stream-showcase__preview :deep(.incremark-typewriter-cursor[data-incremark-cursor-variant="circle"]) {
  background: radial-gradient(circle at 35% 35%, #4b4b4b 0%, #1f1f1f 42%, #090909 100%);
  box-shadow: 0 0 0 1px rgba(17, 17, 17, 0.08), 0 6px 18px rgba(17, 17, 17, 0.18);
  animation: stream-showcase-soft-blink 1.25s ease-in-out infinite;
}

.stream-showcase__preview :deep(.incremark-typewriter-cursor[hidden]) {
  display: none;
}

.stream-showcase__preview :deep(th),
.stream-showcase__preview :deep(td) {
  padding: 8px 10px;
  border: 1px solid var(--stream-table-border);
}

@keyframes stream-showcase-cursor-blink {
  0%, 48% {
    opacity: 1;
  }

  50%, 100% {
    opacity: 0.18;
  }
}

@keyframes stream-showcase-soft-blink {
  0%, 100% {
    opacity: 0.92;
  }

  50% {
    opacity: 0.32;
  }
}

@media (max-width: 640px) {
  .stream-showcase {
    padding: 18px;
  }

  .stream-showcase__controls,
  .stream-showcase__actions {
    flex-direction: column;
  }

  .stream-showcase__field,
  .stream-showcase__action {
    width: 100%;
  }
}
</style>
