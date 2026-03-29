import { IncrementalDomRenderer } from 'incremark-renderer';
import { createApp, h, nextTick, ref } from 'vue';

function buildSampleMarkdown(sectionCount = 18) {
  const sections = [
    '# Streaming Rendering Benchmark',
    '',
    '这是一页用于对比 `incremark-renderer` 与 `markstream-vue` 在流式场景下的渲染性能。',
    '',
    '核心观察点：',
    '',
    '- 同一份 Markdown 输入',
    '- 同一组 chunk 大小',
    '- 同一页里同步播放',
    '- 同一页里多轮 benchmark',
    '',
  ];

  for (let index = 1; index <= sectionCount; index += 1) {
    sections.push(
      `## Section ${index}`,
      '',
      `第 ${index} 段用于拉长文档长度，观察随着内容持续增长时的流式更新成本。这里包含一个 [benchmark link ${index}](https://example.com/${index})，以及一段强调文本 **important ${index}**。`,
      '',
      '- first item',
      '- second item',
      `- section marker ${index}`,
      '',
      '> 这是一段引用，用来模拟聊天输出中常见的说明块。',
      '',
      '| key | value |',
      '| --- | --- |',
      `| section | ${index} |`,
      '| mode | streaming |',
      '',
      '```ts',
      `export function section${index}(value: number) {`,
      `  return value + ${index};`,
      '}',
      '```',
      '',
    );
  }

  return sections.join('\n');
}

const sampleMarkdown = buildSampleMarkdown();

const BENCHMARK_IDLE_SUMMARY = [
  '点击“运行性能对比”后，这里会展示两套渲染路径的平均总耗时、单次平均更新耗时和速度比。',
  '',
  '说明：',
  '- incremark-renderer：IncrementalDomRenderer.append(chunk) + finalize()',
  '- markstream-vue：更新 `content`，等待 Vue `nextTick()` 刷新，再在流结束时标记 `final=true`',
].join('\n');

const BENCHMARK_IDLE_LOG = '尚未运行性能对比。';

const sourceInput = document.querySelector('#source-input');
const chunkSizeInput = document.querySelector('#chunk-size');
const playIntervalInput = document.querySelector('#play-interval');
const benchmarkRunsInput = document.querySelector('#benchmark-runs');
const resetButton = document.querySelector('#reset-button');
const stepButton = document.querySelector('#step-button');
const playButton = document.querySelector('#play-button');
const benchmarkButton = document.querySelector('#benchmark-button');
const consumedValue = document.querySelector('#consumed-value');
const chunkCountValue = document.querySelector('#chunk-count-value');
const benchmarkIncremarkValue = document.querySelector('#benchmark-incremark-value');
const benchmarkMarkstreamValue = document.querySelector('#benchmark-markstream-value');
const benchmarkSpeedupValue = document.querySelector('#benchmark-speedup-value');
const benchmarkSummary = document.querySelector('#benchmark-summary');
const benchmarkLog = document.querySelector('#benchmark-log');
const incremarkRoot = document.querySelector('#incremark-root');
const markstreamRoot = document.querySelector('#markstream-root');
const benchmarkSandbox = document.querySelector('#benchmark-sandbox');
const runtimeNote = document.querySelector('#runtime-note');

if (
  !(sourceInput instanceof HTMLTextAreaElement) ||
  !(chunkSizeInput instanceof HTMLInputElement) ||
  !(playIntervalInput instanceof HTMLInputElement) ||
  !(benchmarkRunsInput instanceof HTMLInputElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(stepButton instanceof HTMLButtonElement) ||
  !(playButton instanceof HTMLButtonElement) ||
  !(benchmarkButton instanceof HTMLButtonElement) ||
  !(consumedValue instanceof HTMLElement) ||
  !(chunkCountValue instanceof HTMLElement) ||
  !(benchmarkIncremarkValue instanceof HTMLElement) ||
  !(benchmarkMarkstreamValue instanceof HTMLElement) ||
  !(benchmarkSpeedupValue instanceof HTMLElement) ||
  !(benchmarkSummary instanceof HTMLElement) ||
  !(benchmarkLog instanceof HTMLElement) ||
  !(incremarkRoot instanceof HTMLElement) ||
  !(markstreamRoot instanceof HTMLElement) ||
  !(benchmarkSandbox instanceof HTMLElement) ||
  !(runtimeNote instanceof HTMLElement)
) {
  throw new Error('markstream comparison demo failed to initialize.');
}

sourceInput.value = sampleMarkdown;

let incremarkRenderer = createIncremarkRenderer(incremarkRoot);
let markstreamHarness = null;
let markstreamComponent = null;
let playbackTimer = null;
let playbackRunning = false;
let benchmarkRunning = false;
let cursor = 0;
let emittedChunks = 0;
let liveFinalized = false;

function createIncremarkRenderer(root) {
  root.innerHTML = '';
  return new IncrementalDomRenderer(root, {
    highlight: false,
    math: false,
    container: false,
  });
}

async function createMarkstreamHarness(root, component, customId) {
  const content = ref('');
  const final = ref(false);
  const app = createApp({
    name: 'MarkstreamHarness',
    render() {
      return h(component, {
        content: content.value,
        final: final.value,
        customId,
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
      });
    },
  });

  app.mount(root);
  await nextTick();

  return {
    async append(chunk) {
      content.value += chunk;
      await nextTick();
    },
    async finalize() {
      final.value = true;
      await nextTick();
    },
    async reset() {
      content.value = '';
      final.value = false;
      await nextTick();
    },
    destroy() {
      app.unmount();
      root.innerHTML = '';
    },
  };
}

function getSource() {
  return sourceInput.value;
}

function getChunkSize() {
  return Math.max(1, Number.parseInt(chunkSizeInput.value, 10) || 1);
}

function getPlayInterval() {
  return Math.max(8, Number.parseInt(playIntervalInput.value, 10) || 20);
}

function getBenchmarkRuns() {
  return Math.max(1, Math.min(24, Number.parseInt(benchmarkRunsInput.value, 10) || 1));
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

function syncLiveStatus() {
  consumedValue.textContent = String(cursor);
  chunkCountValue.textContent = String(emittedChunks);
}

function resetBenchmarkResults(message = BENCHMARK_IDLE_SUMMARY) {
  benchmarkIncremarkValue.textContent = '--';
  benchmarkMarkstreamValue.textContent = '--';
  benchmarkSpeedupValue.textContent = '--';
  benchmarkSummary.textContent = message;
  benchmarkLog.textContent = BENCHMARK_IDLE_LOG;
}

function invalidateBenchmarkResults() {
  if (benchmarkRunning) {
    return;
  }

  resetBenchmarkResults('当前配置已变更，请重新运行性能对比。');
}

function createBenchmarkRoot(kind) {
  const root = document.createElement('div');
  root.className = `preview compare-preview compare-benchmark-root compare-benchmark-root-${kind}`;
  benchmarkSandbox.append(root);
  return root;
}

async function finalizeLiveRenderers() {
  if (liveFinalized || !markstreamHarness) {
    return;
  }

  incremarkRenderer.finalize();
  await markstreamHarness.finalize();
  liveFinalized = true;
}

function stopPlayback() {
  playbackRunning = false;
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  playButton.textContent = '自动播放';
}

async function resetLiveDemo() {
  stopPlayback();
  incremarkRenderer.reset();
  if (markstreamHarness) {
    await markstreamHarness.reset();
  }
  cursor = 0;
  emittedChunks = 0;
  liveFinalized = false;
  syncLiveStatus();
}

async function stepBoth() {
  if (!markstreamHarness) {
    return false;
  }

  const source = getSource();
  if (cursor >= source.length) {
    return false;
  }

  const nextCursor = Math.min(source.length, cursor + getChunkSize());
  const chunk = source.slice(cursor, nextCursor);
  cursor = nextCursor;
  emittedChunks += 1;
  incremarkRenderer.append(chunk);
  await markstreamHarness.append(chunk);

  if (cursor >= source.length) {
    await finalizeLiveRenderers();
  }

  syncLiveStatus();
  return cursor < source.length;
}

async function playbackLoop() {
  if (!playbackRunning) {
    return;
  }

  const keepGoing = await stepBoth();
  if (!keepGoing) {
    stopPlayback();
    return;
  }

  playbackTimer = window.setTimeout(() => {
    void playbackLoop();
  }, getPlayInterval());
}

async function startPlayback() {
  if (playbackRunning) {
    stopPlayback();
    return;
  }

  playbackRunning = true;
  playButton.textContent = '停止播放';
  await playbackLoop();
}

async function measureIncremarkRun(chunks) {
  const root = createBenchmarkRoot('incremark');
  const renderer = createIncremarkRenderer(root);
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

async function measureMarkstreamRun(chunks) {
  const root = createBenchmarkRoot('markstream');
  const harness = await createMarkstreamHarness(root, markstreamComponent, 'markstream-benchmark');
  let totalMs = 0;
  let maxMs = 0;
  let updateCount = 0;

  for (const chunk of chunks) {
    const start = performance.now();
    await harness.append(chunk);
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);
    updateCount += 1;
  }

  const finalizeStart = performance.now();
  await harness.finalize();
  const finalizeElapsed = performance.now() - finalizeStart;
  totalMs += finalizeElapsed;
  maxMs = Math.max(maxMs, finalizeElapsed);
  updateCount += 1;

  harness.destroy();
  root.remove();

  return {
    totalMs,
    maxMs,
    updateCount,
  };
}

function summarizeRuns(runs) {
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
  const reduction = result.markstream.averageTotalMs > 0
    ? (1 - result.incremark.averageTotalMs / result.markstream.averageTotalMs) * 100
    : 0;

  return [
    '测试方法',
    `- 输入长度：${result.sourceLength} chars`,
    `- chunk 大小：${result.chunkSize}`,
    `- chunk 数量：${result.chunkCount}`,
    `- 每组轮次：${result.runs}`,
    '- incremark-renderer：IncrementalDomRenderer，关闭 highlight / math / container',
    '- markstream-vue：MarkdownRender + content 流式更新，renderCodeBlocksAsPre=true，viewportPriority=false',
    '',
    '结果摘要',
    `- incremark 平均总耗时：${formatDuration(result.incremark.averageTotalMs)}`,
    `- incremark 单次平均更新：${formatDuration(result.incremark.averageUpdateMs)}`,
    `- incremark 最慢单次更新：${formatDuration(result.incremark.slowestUpdateMs)}`,
    `- markstream 平均总耗时：${formatDuration(result.markstream.averageTotalMs)}`,
    `- markstream 单次平均更新：${formatDuration(result.markstream.averageUpdateMs)}`,
    `- markstream 最慢单次更新：${formatDuration(result.markstream.slowestUpdateMs)}`,
    `- 速度比（markstream / incremark）：${formatSpeedup(result.speedup)}`,
    `- 总耗时下降：${formatPercent(reduction)}`,
    '',
    '说明',
    '- benchmark 不包含运行时与 CDN 的首次加载成本。',
    '- benchmark 统计的是 chunk 更新触发的同步渲染工作，不包含真实屏幕绘制时间。',
    '- markstream-vue 的计时包含 `content` 更新到 `nextTick()` 完成之间的 Vue 刷新成本。',
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
        `  incremark  total=${formatDuration(round.incremark.totalMs)} avg=${formatDuration(round.incremark.totalMs / round.incremark.updateCount)} max=${formatDuration(round.incremark.maxMs)} updates=${round.incremark.updateCount}`,
        `  markstream total=${formatDuration(round.markstream.totalMs)} avg=${formatDuration(round.markstream.totalMs / round.markstream.updateCount)} max=${formatDuration(round.markstream.maxMs)} updates=${round.markstream.updateCount}`,
      ].join('\n');
    })
    .join('\n\n');
}

function setBenchmarkRunningState(running, label = '运行性能对比') {
  setControlsDisabled(running);
  benchmarkRunning = running;
  benchmarkButton.disabled = running;
  benchmarkButton.textContent = label;
}

async function runBenchmark() {
  if (benchmarkRunning) {
    return;
  }

  stopPlayback();

  const source = getSource();
  const chunkSize = getChunkSize();
  const runs = getBenchmarkRuns();
  const chunks = splitIntoChunks(source, chunkSize);

  if (source.length === 0 || chunks.length === 0) {
    resetBenchmarkResults('请先输入一段 Markdown 内容，再运行性能对比。');
    return;
  }

  setBenchmarkRunningState(true, '预热中...');
  benchmarkSummary.textContent = '准备 benchmark 环境并执行预热轮次...';
  benchmarkLog.textContent = 'Warmup: incremark -> markstream';

  try {
    await nextFrame();
    await measureIncremarkRun(chunks);
    await measureMarkstreamRun(chunks);
    await nextFrame();

    const rounds = [];

    for (let roundIndex = 0; roundIndex < runs; roundIndex += 1) {
      const order = roundIndex % 2 === 0
        ? ['incremark', 'markstream']
        : ['markstream', 'incremark'];
      let incremark = null;
      let markstream = null;

      setBenchmarkRunningState(true, `测试中 ${roundIndex + 1}/${runs}`);
      benchmarkSummary.textContent = `正在执行第 ${roundIndex + 1} / ${runs} 轮性能对比...`;

      for (const strategy of order) {
        if (strategy === 'incremark') {
          incremark = await measureIncremarkRun(chunks);
        } else {
          markstream = await measureMarkstreamRun(chunks);
        }
      }

      rounds.push({
        order,
        incremark,
        markstream,
      });
      benchmarkLog.textContent = formatBenchmarkLog(rounds);

      if (roundIndex < runs - 1) {
        await nextFrame();
      }
    }

    const incremark = summarizeRuns(rounds.map((round) => round.incremark));
    const markstream = summarizeRuns(rounds.map((round) => round.markstream));
    const speedup = incremark.averageTotalMs > 0
      ? markstream.averageTotalMs / incremark.averageTotalMs
      : 0;
    const result = {
      sourceLength: source.length,
      chunkSize,
      chunkCount: chunks.length,
      runs,
      incremark,
      markstream,
      speedup,
    };

    benchmarkIncremarkValue.textContent = formatDuration(incremark.averageTotalMs);
    benchmarkMarkstreamValue.textContent = formatDuration(markstream.averageTotalMs);
    benchmarkSpeedupValue.textContent = formatSpeedup(speedup);
    benchmarkSummary.textContent = formatBenchmarkSummary(result);
    benchmarkLog.textContent = formatBenchmarkLog(rounds);
  } finally {
    setBenchmarkRunningState(false);
  }
}

function setControlsDisabled(disabled) {
  sourceInput.disabled = disabled;
  chunkSizeInput.disabled = disabled;
  playIntervalInput.disabled = disabled;
  benchmarkRunsInput.disabled = disabled;
  resetButton.disabled = disabled;
  stepButton.disabled = disabled;
  playButton.disabled = disabled;
  benchmarkButton.disabled = disabled;
}

async function initialize() {
  setControlsDisabled(true);
  resetBenchmarkResults();
  syncLiveStatus();

  try {
    runtimeNote.textContent = '正在通过 CDN 加载 markstream-vue 运行时...';
    const module = await import('markstream-vue');
    markstreamComponent = module.default ?? module.MarkdownRender;

    if (!markstreamComponent) {
      throw new Error('Unable to resolve MarkdownRender component from markstream-vue.');
    }

    markstreamHarness = await createMarkstreamHarness(
      markstreamRoot,
      markstreamComponent,
      'markstream-live',
    );

    runtimeNote.textContent = 'markstream-vue 运行时已加载。这个页面依赖 CDN 拉取 Vue 与 markstream-vue。';
    setControlsDisabled(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtimeNote.textContent = `markstream-vue 加载失败：${message}`;
    benchmarkSummary.textContent = [
      '无法完成对比页初始化。',
      '',
      '可能原因：',
      '- 当前网络无法访问 esm.sh 或 jsDelivr',
      '- `markstream-vue` 的 CDN 入口发生变化',
    ].join('\n');
    benchmarkLog.textContent = BENCHMARK_IDLE_LOG;
  }
}

resetButton.addEventListener('click', () => {
  void resetLiveDemo();
});

stepButton.addEventListener('click', () => {
  void stepBoth();
});

playButton.addEventListener('click', () => {
  void startPlayback();
});

benchmarkButton.addEventListener('click', () => {
  void runBenchmark();
});

sourceInput.addEventListener('input', () => {
  void resetLiveDemo();
  invalidateBenchmarkResults();
});

chunkSizeInput.addEventListener('input', invalidateBenchmarkResults);
benchmarkRunsInput.addEventListener('input', invalidateBenchmarkResults);

playIntervalInput.addEventListener('input', () => {
  if (playbackRunning) {
    stopPlayback();
    void startPlayback();
  }
});

void initialize();
