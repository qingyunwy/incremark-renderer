import {
  IncrementalDomRenderer,
  StreamingMarkdownController,
  createContainerExtension,
  createHighlightExtension,
  createHtmlSanitizer,
  createMathExtension,
} from 'incremark-renderer';
import { Marked } from 'marked';

const sampleMarkdown = `# Incremark Renderer

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
\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

| stage | behavior |
| --- | --- |
| lexer | incremental |
| render | partial patch |
`;

const BENCHMARK_IDLE_SUMMARY = [
  '点击“运行性能对比”后，这里会展示当前输入文本在流式场景下的性能摘要。',
  '',
  '基线方案会在每个 chunk 上都重新执行完整 Markdown 解析，并整体替换 root.innerHTML。',
].join('\n');

const BENCHMARK_IDLE_LOG = '尚未运行性能对比。';

const sourceInput = document.querySelector('#source-input');
const chunkSizeInput = document.querySelector('#chunk-size');
const playIntervalInput = document.querySelector('#play-interval');
const cursorVariantInput = document.querySelector('#cursor-variant');
const consumedValue = document.querySelector('#consumed-value');
const stableValue = document.querySelector('#stable-value');
const patchValue = document.querySelector('#patch-value');
const delayValue = document.querySelector('#delay-value');
const streamPreview = document.querySelector('#stream-preview');
const patchLog = document.querySelector('#patch-log');
const blocksLog = document.querySelector('#blocks-log');
const previewRoot = document.querySelector('#preview-root');
const streamModeButton = document.querySelector('#stream-mode-button');
const fullModeButton = document.querySelector('#full-mode-button');
const resetButton = document.querySelector('#reset-button');
const stepButton = document.querySelector('#step-button');
const playButton = document.querySelector('#play-button');
const finalizeButton = document.querySelector('#finalize-button');
const benchmarkRunsInput = document.querySelector('#benchmark-runs');
const benchmarkButton = document.querySelector('#benchmark-button');
const benchmarkCharsValue = document.querySelector('#benchmark-chars-value');
const benchmarkChunksValue = document.querySelector('#benchmark-chunks-value');
const benchmarkRunsValue = document.querySelector('#benchmark-runs-value');
const benchmarkIncrementalValue = document.querySelector('#benchmark-incremental-value');
const benchmarkNaiveValue = document.querySelector('#benchmark-naive-value');
const benchmarkSpeedupValue = document.querySelector('#benchmark-speedup-value');
const benchmarkSummary = document.querySelector('#benchmark-summary');
const benchmarkLog = document.querySelector('#benchmark-log');
const benchmarkSandbox = document.querySelector('#benchmark-sandbox');

if (
  !(sourceInput instanceof HTMLTextAreaElement) ||
  !(chunkSizeInput instanceof HTMLInputElement) ||
  !(playIntervalInput instanceof HTMLInputElement) ||
  !(cursorVariantInput instanceof HTMLSelectElement) ||
  !(consumedValue instanceof HTMLElement) ||
  !(stableValue instanceof HTMLElement) ||
  !(patchValue instanceof HTMLElement) ||
  !(delayValue instanceof HTMLElement) ||
  !(streamPreview instanceof HTMLElement) ||
  !(patchLog instanceof HTMLElement) ||
  !(blocksLog instanceof HTMLElement) ||
  !(previewRoot instanceof HTMLElement) ||
  !(streamModeButton instanceof HTMLButtonElement) ||
  !(fullModeButton instanceof HTMLButtonElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(stepButton instanceof HTMLButtonElement) ||
  !(playButton instanceof HTMLButtonElement) ||
  !(finalizeButton instanceof HTMLButtonElement) ||
  !(benchmarkRunsInput instanceof HTMLInputElement) ||
  !(benchmarkButton instanceof HTMLButtonElement) ||
  !(benchmarkCharsValue instanceof HTMLElement) ||
  !(benchmarkChunksValue instanceof HTMLElement) ||
  !(benchmarkRunsValue instanceof HTMLElement) ||
  !(benchmarkIncrementalValue instanceof HTMLElement) ||
  !(benchmarkNaiveValue instanceof HTMLElement) ||
  !(benchmarkSpeedupValue instanceof HTMLElement) ||
  !(benchmarkSummary instanceof HTMLElement) ||
  !(benchmarkLog instanceof HTMLElement) ||
  !(benchmarkSandbox instanceof HTMLElement)
) {
  throw new Error('Demo page failed to initialize.');
}

sourceInput.value = sampleMarkdown;

let streamingController = createStreamingController();
let cursor = 0;
let lastDelayMs = 0;
let typewriterFeedCursor = 0;
let typewriterFeedTimer = null;
let renderMode = 'stream';
let benchmarkRunning = false;
const THINKING_STATUS_LABELS = {
  running: '正在思考',
  completed: '思考完成',
  aborted: '思考中止',
};

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeClassNameSegment(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'default';
}

function getThinkingFingerprint(type, title) {
  return `${type}::${title ?? ''}`;
}

function getThinkingExpandedPreference(fingerprint) {
  for (const node of previewRoot.querySelectorAll('[data-thinking-shell]')) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (node.dataset.thinkingFingerprint === fingerprint) {
      return node.dataset.thinkingExpanded !== 'false';
    }
  }

  return true;
}

function renderThinkingContainer({ type, title, text, closed }) {
  const safeType = escapeHtml(type);
  const safeTitle = title ? escapeHtml(title) : '';
  const fingerprint = getThinkingFingerprint(type, title);
  const expanded = getThinkingExpandedPreference(fingerprint);
  const statusLabel = closed ? THINKING_STATUS_LABELS.completed : THINKING_STATUS_LABELS.running;

  return `<section class="demo-thinking" data-thinking-shell data-thinking-type="${safeType}" data-thinking-title="${safeTitle}" data-thinking-fingerprint="${escapeHtml(fingerprint)}" data-thinking-expanded="${String(expanded)}" data-thinking-closed="${String(closed)}"><button type="button" class="demo-thinking-toggle" data-thinking-toggle aria-expanded="${String(expanded)}"><span class="demo-thinking-toggle-copy"><span class="demo-thinking-chip">${safeType}</span>${title ? `<strong class="demo-thinking-title">${safeTitle}</strong>` : ''}</span><span class="demo-thinking-meta"><span class="demo-thinking-status" data-thinking-status-text>${statusLabel}</span><span class="demo-thinking-toggle-label" data-thinking-toggle-label>${expanded ? '折叠' : '展开'}</span><span class="demo-thinking-chevron" aria-hidden="true"></span></span></button><div class="demo-thinking-body" data-thinking-body><pre class="demo-thinking-text">${escapeHtml(text)}</pre></div></section>`;
}

function renderDemoContainer(context) {
  if (context.type === 'thinking') {
    return renderThinkingContainer(context);
  }

  const { type, title, innerHtml } = context;
  const safeType = escapeHtml(type);
  const safeTitle = title
    ? `<strong class="demo-callout-title">${escapeHtml(title)}</strong>`
    : '';

  return `<aside class="demo-callout demo-callout-${sanitizeClassNameSegment(type)}" data-demo-callout="${safeType}"><div class="demo-callout-head"><span class="demo-callout-chip">${safeType}</span>${safeTitle}</div><div class="demo-callout-body">${innerHtml}</div></aside>`;
}

function createDemoRendererOptions() {
  return {
    container: {
      render: renderDemoContainer,
    },
    highlight: {
      showLineNumbers: true,
      renderHeader: ({ code, defaultHeaderContent }) => {
        const encodedCode = encodeURIComponent(code);
        return `${defaultHeaderContent}<button type="button" class="incremark-code-action" data-copy-code="${encodedCode}">Copy</button>`;
      },
    },
  };
}

function getThinkingStatus(shell) {
  const isClosed = shell.dataset.thinkingClosed === 'true';

  if (isClosed) {
    return 'completed';
  }

  if (renderMode === 'full') {
    return 'aborted';
  }

  if (streamingController.isClosed() || cursor >= getSource().length) {
    return 'aborted';
  }

  return 'running';
}

function setThinkingExpanded(shell, expanded) {
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

function syncThinkingPanels() {
  previewRoot.querySelectorAll('[data-thinking-shell]').forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

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

function toggleThinkingPanel(toggleButton) {
  const shell = toggleButton.closest('[data-thinking-shell]');
  if (!(shell instanceof HTMLElement)) {
    return;
  }

  const nextExpanded = shell.dataset.thinkingExpanded !== 'true';
  setThinkingExpanded(shell, nextExpanded);
}

function createStreamingController() {
  previewRoot.innerHTML = '';
  const controller = new StreamingMarkdownController(previewRoot, {
    cursor: getCursorOptions(),
    renderer: createDemoRendererOptions(),
    typewriter: {
      baseDelayMs: getPlayInterval(),
      minChunkSize: 1,
      maxChunkSize: getPlaybackChunkSize(),
    },
    onChunk: (chunk, meta) => {
      cursor += chunk.length;
      lastDelayMs = meta.delayMs;
      syncStatus(meta.patches);
    },
    onComplete: (meta) => {
      if (typewriterFeedTimer !== null) {
        clearTimeout(typewriterFeedTimer);
        typewriterFeedTimer = null;
      }
      typewriterFeedCursor = cursor;
      syncStatus(meta.patches);
      controller.cursorController?.hide();
      playButton.textContent = '自动播放';
    },
  });
  return controller;
}

function createNaiveFullRender() {
  const rendererOptions = createDemoRendererOptions();
  const marked = new Marked(
    createMathExtension(),
    createContainerExtension(rendererOptions.container),
    createHighlightExtension(rendererOptions.highlight, {
      highlightEnabled: true,
    }),
  );
  const sanitizeHtml = createHtmlSanitizer({});

  return (markdown) => {
    const html = marked.parser(marked.lexer(markdown));
    return sanitizeHtml(html);
  };
}

function getChunkSize() {
  return Math.max(1, Number.parseInt(chunkSizeInput.value, 10) || 1);
}

function getPlaybackChunkSize() {
  return Math.max(1, Math.min(3, Math.ceil(getChunkSize() / 8)));
}

function getPlayInterval() {
  return Math.max(8, Number.parseInt(playIntervalInput.value, 10) || 26);
}

function getBenchmarkRuns() {
  return Math.max(1, Math.min(30, Number.parseInt(benchmarkRunsInput.value, 10) || 1));
}

function getCursorVariant() {
  return cursorVariantInput.value === 'circle' ? 'circle' : 'bar';
}

function getCursorOptions() {
  return cursorVariantInput.value === 'none'
    ? false
    : {
        variant: getCursorVariant(),
      };
}

function getFeedInterval() {
  return Math.max(80, Math.round(getPlayInterval() * 3.2));
}

function getSource() {
  return sourceInput.value;
}

function splitIntoChunks(source, chunkSize) {
  const chunks = [];

  for (let start = 0; start < source.length; start += chunkSize) {
    chunks.push(source.slice(start, start + chunkSize));
  }

  return chunks;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function maxValue(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function formatDuration(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  if (value >= 100) {
    return `${value.toFixed(1)}ms`;
  }

  return `${value.toFixed(2)}ms`;
}

function formatSpeedup(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '--';
  }

  return `${value.toFixed(2)}x`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return `${value.toFixed(1)}%`;
}

function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function updateModeUi() {
  const isStream = renderMode === 'stream';
  streamModeButton.classList.toggle('is-active', isStream);
  fullModeButton.classList.toggle('is-active', !isStream);
  streamModeButton.setAttribute('aria-pressed', String(isStream));
  fullModeButton.setAttribute('aria-pressed', String(!isStream));

  playIntervalInput.disabled = !isStream;
  playButton.disabled = !isStream;
  finalizeButton.disabled = !isStream;
  stepButton.textContent = isStream ? '追加一段' : '全量渲染';
  playButton.textContent = '自动播放';
}

function describePatches(patches) {
  if (patches.length === 0) {
    return 'No patches emitted.';
  }

  return patches
    .map((patch, index) => {
      const astInfo = patch.astPatches?.length
        ? ` ast=${patch.astPatches.length}`
        : '';
      return `${index + 1}. ${patch.type} key=${patch.key} index=${patch.index}${astInfo}`;
    })
    .join('\n');
}

function describeBlocks() {
  const blocks = streamingController.getBlocks();
  if (blocks.length === 0) {
    return 'No visible blocks.';
  }

  return blocks
    .map((block, index) => {
      const lines = block.text.replace(/\n/g, '\\n');
      return `${index + 1}. ${block.key} stable=${block.stable} digest=${block.digest.slice(0, 48)} text="${lines}"`;
    })
    .join('\n');
}

function syncStatus(patches = []) {
  const snapshot = streamingController.getBlocks();
  consumedValue.textContent = String(cursor);
  stableValue.textContent = String(snapshot.filter((block) => block.stable).length);
  patchValue.textContent = String(patches.length);
  delayValue.textContent = `${lastDelayMs}ms`;
  streamPreview.textContent = getSource().slice(0, cursor);
  patchLog.textContent = describePatches(patches);
  blocksLog.textContent = describeBlocks();
  syncThinkingPanels();
}

function syncBenchmarkConfigStats() {
  const source = getSource();
  const chunks = splitIntoChunks(source, getChunkSize());
  benchmarkCharsValue.textContent = String(source.length);
  benchmarkChunksValue.textContent = String(chunks.length);
  benchmarkRunsValue.textContent = String(getBenchmarkRuns());
}

function resetBenchmarkResults(message = BENCHMARK_IDLE_SUMMARY) {
  benchmarkIncrementalValue.textContent = '--';
  benchmarkNaiveValue.textContent = '--';
  benchmarkSpeedupValue.textContent = '--';
  benchmarkSummary.textContent = message;
  benchmarkLog.textContent = BENCHMARK_IDLE_LOG;
  syncBenchmarkConfigStats();
}

function invalidateBenchmarkResults() {
  if (benchmarkRunning) {
    return;
  }

  resetBenchmarkResults('当前配置已变更，请重新运行性能对比。');
}

function createBenchmarkRoot() {
  const root = document.createElement('div');
  root.className = 'preview benchmark-render-root';
  benchmarkSandbox.append(root);
  return root;
}

function measureIncrementalRun(chunks) {
  const root = createBenchmarkRoot();
  const renderer = new IncrementalDomRenderer(root, createDemoRendererOptions());
  let totalMs = 0;
  let maxMs = 0;
  let updateCount = 0;

  for (const chunk of chunks) {
    const start = performance.now();
    renderer.append(chunk);
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);
    updateCount += 1;
  }

  const finalizeStart = performance.now();
  renderer.finalize();
  const finalizeElapsed = performance.now() - finalizeStart;
  totalMs += finalizeElapsed;
  maxMs = Math.max(maxMs, finalizeElapsed);
  updateCount += 1;

  root.remove();

  return {
    totalMs,
    maxMs,
    updateCount,
  };
}

function measureNaiveRun(chunks, renderFullMarkdown) {
  const root = createBenchmarkRoot();
  let totalMs = 0;
  let maxMs = 0;
  let updateCount = 0;
  let source = '';

  for (const chunk of chunks) {
    source += chunk;
    const start = performance.now();
    root.innerHTML = renderFullMarkdown(source);
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);
    updateCount += 1;
  }

  root.remove();

  return {
    totalMs,
    maxMs,
    updateCount,
  };
}

function summarizeBenchmarkRuns(runs) {
  const totals = runs.map((run) => run.totalMs);
  const peaks = runs.map((run) => run.maxMs);
  const updateCount = runs[0]?.updateCount ?? 0;
  const averageTotalMs = average(totals);

  return {
    averageTotalMs,
    averageUpdateMs: updateCount > 0 ? averageTotalMs / updateCount : 0,
    slowestUpdateMs: maxValue(peaks),
    updateCount,
  };
}

function formatBenchmarkSummary(result) {
  const reduction = result.naive.averageTotalMs > 0
    ? (1 - result.incremental.averageTotalMs / result.naive.averageTotalMs) * 100
    : 0;

  return [
    '测试方法',
    `- 输入长度：${result.sourceLength} chars`,
    `- chunk 大小：${result.chunkSize}`,
    `- chunk 数量：${result.chunkCount}`,
    `- 每组轮次：${result.runs}`,
    '- 增量方案：对每个 chunk 执行 IncrementalDomRenderer.append(chunk)，结束时额外执行 finalize()。',
    '- 全量方案：对每个 chunk 重新执行完整 Markdown lexer/parser，再整体替换 root.innerHTML。',
    '',
    '结果摘要',
    `- 增量平均总耗时：${formatDuration(result.incremental.averageTotalMs)}`,
    `- 增量单次平均更新：${formatDuration(result.incremental.averageUpdateMs)}`,
    `- 增量最慢单次更新：${formatDuration(result.incremental.slowestUpdateMs)}`,
    `- 全量平均总耗时：${formatDuration(result.naive.averageTotalMs)}`,
    `- 全量单次平均更新：${formatDuration(result.naive.averageUpdateMs)}`,
    `- 全量最慢单次更新：${formatDuration(result.naive.slowestUpdateMs)}`,
    `- 速度提升：${formatSpeedup(result.speedup)}`,
    `- 总耗时下降：${formatPercent(reduction)}`,
    '',
    '说明',
    '- 统计的是主线程里的同步解析和 DOM 更新耗时，不包含网络与真实绘制时间。',
    '- 每轮会交替执行先后顺序，尽量减少固定顺序带来的偏差。',
  ].join('\n');
}

function formatBenchmarkLog(rounds) {
  if (rounds.length === 0) {
    return BENCHMARK_IDLE_LOG;
  }

  return rounds
    .map((round, index) => {
      const order = round.order.join(' -> ');
      return [
        `Round ${index + 1} (${order})`,
        `  incremental total=${formatDuration(round.incremental.totalMs)} avg=${formatDuration(round.incremental.totalMs / round.incremental.updateCount)} max=${formatDuration(round.incremental.maxMs)} updates=${round.incremental.updateCount}`,
        `  naive       total=${formatDuration(round.naive.totalMs)} avg=${formatDuration(round.naive.totalMs / round.naive.updateCount)} max=${formatDuration(round.naive.maxMs)} updates=${round.naive.updateCount}`,
      ].join('\n');
    })
    .join('\n\n');
}

function setBenchmarkRunningState(running, label = '运行性能对比') {
  benchmarkRunning = running;
  benchmarkButton.disabled = running;
  benchmarkButton.textContent = label;
}

async function runBenchmarkComparison() {
  if (benchmarkRunning) {
    return;
  }

  stopPlayback();

  const source = getSource();
  const chunkSize = getChunkSize();
  const runs = getBenchmarkRuns();
  const chunks = splitIntoChunks(source, chunkSize);

  syncBenchmarkConfigStats();

  if (source.length === 0 || chunks.length === 0) {
    resetBenchmarkResults('请先输入一段 Markdown 内容，再运行性能对比。');
    return;
  }

  setBenchmarkRunningState(true, '预热中...');
  benchmarkSummary.textContent = '准备 benchmark 环境并执行预热轮次...';
  benchmarkLog.textContent = 'Warmup: incremental -> naive';

  try {
    const renderFullMarkdown = createNaiveFullRender();

    await nextFrame();
    measureIncrementalRun(chunks);
    measureNaiveRun(chunks, renderFullMarkdown);
    await nextFrame();

    const rounds = [];

    for (let roundIndex = 0; roundIndex < runs; roundIndex += 1) {
      const order = roundIndex % 2 === 0
        ? ['incremental', 'naive']
        : ['naive', 'incremental'];
      let incremental = null;
      let naive = null;

      setBenchmarkRunningState(true, `测试中 ${roundIndex + 1}/${runs}`);
      benchmarkSummary.textContent = `正在执行第 ${roundIndex + 1} / ${runs} 轮性能对比...`;

      for (const strategy of order) {
        if (strategy === 'incremental') {
          incremental = measureIncrementalRun(chunks);
        } else {
          naive = measureNaiveRun(chunks, renderFullMarkdown);
        }
      }

      rounds.push({
        order,
        incremental,
        naive,
      });
      benchmarkLog.textContent = formatBenchmarkLog(rounds);

      if (roundIndex < runs - 1) {
        await nextFrame();
      }
    }

    const incremental = summarizeBenchmarkRuns(rounds.map((round) => round.incremental));
    const naive = summarizeBenchmarkRuns(rounds.map((round) => round.naive));
    const speedup = incremental.averageTotalMs > 0
      ? naive.averageTotalMs / incremental.averageTotalMs
      : 0;
    const result = {
      sourceLength: source.length,
      chunkSize,
      chunkCount: chunks.length,
      runs,
      incremental,
      naive,
      speedup,
    };

    benchmarkIncrementalValue.textContent = formatDuration(incremental.averageTotalMs);
    benchmarkNaiveValue.textContent = formatDuration(naive.averageTotalMs);
    benchmarkSpeedupValue.textContent = formatSpeedup(speedup);
    benchmarkSummary.textContent = formatBenchmarkSummary(result);
    benchmarkLog.textContent = formatBenchmarkLog(rounds);
  } finally {
    setBenchmarkRunningState(false);
  }
}

function stopPlayback() {
  streamingController.pause();
  if (typewriterFeedTimer !== null) {
    clearTimeout(typewriterFeedTimer);
    typewriterFeedTimer = null;
  }
  typewriterFeedCursor = cursor;
  streamingController.cursorController?.hide();
  playButton.textContent = '自动播放';
}

function pushNextPlaybackChunk(source) {
  if (typewriterFeedCursor >= source.length) {
    if (!streamingController.isClosed()) {
      streamingController.close();
    }
    return;
  }

  const nextFeedCursor = Math.min(source.length, typewriterFeedCursor + getChunkSize());
  const chunk = source.slice(typewriterFeedCursor, nextFeedCursor);
  typewriterFeedCursor = nextFeedCursor;
  streamingController.push(chunk);

  if (typewriterFeedCursor >= source.length) {
    streamingController.close();
  }
}

function scheduleNextPlaybackFeed(source) {
  if (typewriterFeedTimer !== null) {
    clearTimeout(typewriterFeedTimer);
    typewriterFeedTimer = null;
  }

  if (typewriterFeedCursor >= source.length) {
    if (!streamingController.isClosed()) {
      streamingController.close();
    }
    return;
  }

  typewriterFeedTimer = setTimeout(() => {
    typewriterFeedTimer = null;
    pushNextPlaybackChunk(source);
    scheduleNextPlaybackFeed(source);
  }, getFeedInterval());
}

function startPlayback() {
  if (renderMode !== 'stream') {
    return;
  }

  stopPlayback();
  const source = getSource();
  if (cursor >= source.length) {
    playButton.textContent = '自动播放';
    return;
  }

  streamingController.setTypewriterOptions({
    baseDelayMs: getPlayInterval(),
    minChunkSize: 1,
    maxChunkSize: getPlaybackChunkSize(),
  });
  typewriterFeedCursor = cursor;
  playButton.textContent = '停止播放';
  pushNextPlaybackChunk(source);
  scheduleNextPlaybackFeed(source);
}

function resetDemo() {
  stopPlayback();
  streamingController.destroy();
  streamingController = createStreamingController();
  cursor = 0;
  typewriterFeedCursor = 0;
  typewriterFeedTimer = null;
  lastDelayMs = 0;
  syncStatus();
}

function stepDemo() {
  if (renderMode === 'full') {
    stopPlayback();
    cursor = getSource().length;
    lastDelayMs = 0;
    const patches = streamingController.renderer.setMarkdown(getSource());
    syncStatus(patches);
    streamingController.cursorController?.hide();
    return false;
  }

  const source = getSource();
  if (cursor >= source.length) {
    return false;
  }

  const nextCursor = Math.min(source.length, cursor + getChunkSize());
  const chunk = source.slice(cursor, nextCursor);
  cursor = nextCursor;
  lastDelayMs = 0;
  const patches = streamingController.renderer.append(chunk);
  syncStatus(patches);
  streamingController.cursorController?.hide();
  return cursor < source.length;
}

function finalizeDemo() {
  stopPlayback();
  lastDelayMs = 0;
  const patches = streamingController.renderer.finalize();
  syncStatus(patches);
  streamingController.cursorController?.hide();
}

previewRoot.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const thinkingToggle = target.closest('[data-thinking-toggle]');
  if (thinkingToggle instanceof HTMLButtonElement) {
    toggleThinkingPanel(thinkingToggle);
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
});

resetButton.addEventListener('click', resetDemo);
stepButton.addEventListener('click', () => {
  stepDemo();
});

playButton.addEventListener('click', () => {
  if (streamingController.isRunning()) {
    stopPlayback();
    return;
  }

  startPlayback();
});

finalizeButton.addEventListener('click', finalizeDemo);
sourceInput.addEventListener('input', () => {
  resetDemo();
  invalidateBenchmarkResults();
});
chunkSizeInput.addEventListener('input', invalidateBenchmarkResults);
benchmarkRunsInput.addEventListener('input', invalidateBenchmarkResults);
benchmarkButton.addEventListener('click', () => {
  void runBenchmarkComparison();
});
streamModeButton.addEventListener('click', () => {
  if (renderMode === 'stream') {
    return;
  }
  renderMode = 'stream';
  resetDemo();
  updateModeUi();
});
fullModeButton.addEventListener('click', () => {
  if (renderMode === 'full') {
    return;
  }
  renderMode = 'full';
  resetDemo();
  updateModeUi();
});
playIntervalInput.addEventListener('input', () => {
  if (streamingController.isRunning()) {
    startPlayback();
  }
});
cursorVariantInput.addEventListener('input', resetDemo);

updateModeUi();
syncStatus();
resetBenchmarkResults();
