<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { StreamingMarkdownController } from '../../../../dist/index.js';

const DEFAULT_MARKDOWN = `# Incremark Renderer

这是一个用于验证增量 Markdown 渲染效果的 demo。

\`\`\`ts
function renderLineNumberGutter(code: string): { html: string; lineCount: number } {
  const lineCount = splitDisplayLines(code).length;
  const rows: string[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const lineNumber = index + 1;
    rows.push(
      \`<span class="incremark-code-line-number" data-line-number="\${lineNumber}" aria-hidden="true">\${lineNumber}</span>\`,
    );
  }

  return {
    html: rows.join(''),
    lineCount,
  };
}
\`\`\`

行内公式示例：$E = mc^2$，以及 \\(a^2 + b^2 = c^2\\)。

## Feature Checklist

- 只对新增稳定块做 marked lexer
- 当前尾块允许持续重解析
- DOM 仅替换变更块

## Custom Containers

:::note Demo Callout
这个区域在 demo 页面里通过 \`container.render\` 自定义成了 callout 结构。

你可以把类型改成 \`tip\`、\`warning\` 或 \`success\`，看看预览区域的样式变化。
:::

:::warning 流式稳定性
- \`:::\` 没闭合之前会一直留在 tail
- 闭合后才会稳定成独立块

\`\`\`md
:::tip Nested sample
content
:::
\`\`\`
:::

:::thinking Streaming Thought
step 1: inspect \`tail\` state and keep unfinished control lines mutable
step 2: do not parse **markdown** or > quote syntax inside this container
step 3: keep the fold state stable while the text is still streaming
:::

> 下面追加一个代码块，验证围栏闭合前不会过早稳定。

\`\`\`ts
export function sum(a: number, b: number) {
  return a + b;
}
\`\`\`

最后再补一个表格：

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

| stage | behavior |
| --- | --- |
| lexer | incremental |
| render | partial patch |
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
  margin: 24px 0 36px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 241, 235, 0.94)),
    radial-gradient(circle at top right, rgba(196, 91, 45, 0.12), transparent 36%);
  box-shadow: 0 26px 60px rgba(77, 53, 35, 0.12);
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
  border: 1px solid rgba(31, 36, 48, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.74);
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
  border: 1px solid rgba(31, 36, 48, 0.08);
  border-radius: 18px;
  background: rgba(255, 252, 248, 0.94);
}

.stream-showcase__textarea {
  width: 100%;
  padding: 16px;
  resize: vertical;
  color: var(--vp-c-text-1);
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
  border: 1px solid rgba(31, 36, 48, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--vp-c-text-1);
  font: inherit;
}

.stream-showcase__action {
  min-width: 120px;
  padding: 12px 18px;
  border: 1px solid rgba(31, 36, 48, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
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
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.52)),
    var(--callout-soft);
  box-shadow: 0 14px 32px rgba(77, 53, 35, 0.08);
}

.stream-showcase__preview :deep(.demo-callout::before) {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: linear-gradient(180deg, var(--callout-accent) 0%, rgba(255, 255, 255, 0.82) 100%);
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
  background: rgba(255, 255, 255, 0.72);
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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.68)),
    var(--thinking-soft);
  box-shadow: 0 14px 32px rgba(77, 53, 35, 0.08);
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
  border-bottom: 1px solid rgba(31, 36, 48, 0.08);
  border-radius: 0;
  background: transparent;
  color: inherit;
  box-shadow: none;
}

.stream-showcase__preview :deep(.demo-thinking-toggle:hover) {
  transform: none;
  background: rgba(255, 255, 255, 0.28);
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
  background: rgba(255, 255, 255, 0.74);
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
  border-right: 2px solid rgba(31, 36, 48, 0.55);
  border-bottom: 2px solid rgba(31, 36, 48, 0.55);
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
  color: #28313a;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92rem;
  line-height: 1.7;
}

.stream-showcase__preview :deep(blockquote) {
  margin: 0;
  padding-left: 16px;
  border-left: 4px solid rgba(196, 91, 45, 0.35);
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
  border: 1px solid rgba(31, 36, 48, 0.12);
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
