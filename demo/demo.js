import {
  IncrementalDomRenderer,
  StreamingMarkdownTypewriter,
  TypewriterCursorController,
} from 'incremark-renderer';

const sampleMarkdown = `# Incremark Renderer

这是一个用于验证增量 Markdown 渲染效果的 demo。

行内公式示例：$E = mc^2$，以及 \\(a^2 + b^2 = c^2\\)。

## Feature Checklist

- 只对新增稳定块做 marked lexer
- 当前尾块允许持续重解析
- DOM 仅替换变更块

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

const sourceInput = document.querySelector('#source-input');
const chunkSizeInput = document.querySelector('#chunk-size');
const playIntervalInput = document.querySelector('#play-interval');
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

if (
  !(sourceInput instanceof HTMLTextAreaElement) ||
  !(chunkSizeInput instanceof HTMLInputElement) ||
  !(playIntervalInput instanceof HTMLInputElement) ||
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
  !(finalizeButton instanceof HTMLButtonElement)
) {
  throw new Error('Demo page failed to initialize.');
}

sourceInput.value = sampleMarkdown;

let renderer = createRenderer();
let typewriterCursor = createTypewriterCursor();
let cursor = 0;
let lastDelayMs = 0;
let typewriter = null;
let typewriterFeedCursor = 0;
let typewriterFeedTimer = null;
let renderMode = 'stream';

function createRenderer() {
  previewRoot.innerHTML = '';
  return new IncrementalDomRenderer(previewRoot);
}

function createTypewriterCursor() {
  return new TypewriterCursorController(previewRoot);
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

function getFeedInterval() {
  return Math.max(80, Math.round(getPlayInterval() * 3.2));
}

function getSource() {
  return sourceInput.value;
}

function updateModeUi() {
  const isStream = renderMode === 'stream';
  streamModeButton.classList.toggle('is-active', isStream);
  fullModeButton.classList.toggle('is-active', !isStream);
  streamModeButton.setAttribute('aria-pressed', String(isStream));
  fullModeButton.setAttribute('aria-pressed', String(!isStream));

  chunkSizeInput.disabled = !isStream;
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
  const blocks = renderer.getBlocks();
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
  const snapshot = renderer.getBlocks();
  consumedValue.textContent = String(cursor);
  stableValue.textContent = String(snapshot.filter((block) => block.stable).length);
  patchValue.textContent = String(patches.length);
  delayValue.textContent = `${lastDelayMs}ms`;
  streamPreview.textContent = getSource().slice(0, cursor);
  patchLog.textContent = describePatches(patches);
  blocksLog.textContent = describeBlocks();
}

function stopPlayback() {
  if (typewriter !== null) {
    typewriter.pause();
    typewriter = null;
  }
  if (typewriterFeedTimer !== null) {
    clearTimeout(typewriterFeedTimer);
    typewriterFeedTimer = null;
  }
  typewriterFeedCursor = cursor;
  typewriterCursor.hide();
  playButton.textContent = '自动播放';
}

function pushNextPlaybackChunk(source) {
  if (typewriter === null) {
    return;
  }

  if (typewriterFeedCursor >= source.length) {
    if (!typewriter.isClosed()) {
      typewriter.close();
    }
    return;
  }

  const nextFeedCursor = Math.min(source.length, typewriterFeedCursor + getChunkSize());
  const chunk = source.slice(typewriterFeedCursor, nextFeedCursor);
  typewriterFeedCursor = nextFeedCursor;
  typewriter.push(chunk);

  if (typewriterFeedCursor >= source.length) {
    typewriter.close();
  }
}

function scheduleNextPlaybackFeed(source) {
  if (typewriter === null) {
    return;
  }

  if (typewriterFeedTimer !== null) {
    clearTimeout(typewriterFeedTimer);
    typewriterFeedTimer = null;
  }

  if (typewriterFeedCursor >= source.length) {
    if (!typewriter.isClosed()) {
      typewriter.close();
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
  playButton.textContent = '停止播放';

  const source = getSource();
  if (cursor >= source.length) {
    return;
  }

  typewriterFeedCursor = cursor;
  typewriter = new StreamingMarkdownTypewriter({
    baseDelayMs: getPlayInterval(),
    minChunkSize: 1,
    // Keep the upstream push chunk relatively coarse, but let the typewriter
    // emit smaller visual chunks so the demo still looks like a real typing flow.
    maxChunkSize: getPlaybackChunkSize(),
    onChunk: (chunk, meta) => {
      cursor += chunk.length;
      lastDelayMs = meta.delayMs;
      const patches = renderer.append(chunk);
      syncStatus(patches);
      if (meta.inCodeFence) {
        typewriterCursor.hide();
      } else {
        typewriterCursor.show();
        typewriterCursor.update();
      }
    },
    onComplete: () => {
      typewriter = null;
      if (typewriterFeedTimer !== null) {
        clearTimeout(typewriterFeedTimer);
        typewriterFeedTimer = null;
      }
      typewriterFeedCursor = cursor;
      typewriterCursor.hide();
      playButton.textContent = '自动播放';
    },
  });
  typewriter.start();
  typewriterCursor.show();
  pushNextPlaybackChunk(source);
  scheduleNextPlaybackFeed(source);
}

function resetDemo() {
  stopPlayback();
  typewriterCursor.destroy();
  renderer = createRenderer();
  typewriterCursor = createTypewriterCursor();
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
    const patches = renderer.setMarkdown(getSource());
    syncStatus(patches);
    typewriterCursor.hide();
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
  const patches = renderer.append(chunk);
  syncStatus(patches);
  typewriterCursor.hide();
  return cursor < source.length;
}

function finalizeDemo() {
  stopPlayback();
  lastDelayMs = 0;
  const patches = renderer.finalize();
  syncStatus(patches);
  typewriterCursor.hide();
}

resetButton.addEventListener('click', resetDemo);
stepButton.addEventListener('click', () => {
  stepDemo();
});

playButton.addEventListener('click', () => {
  if (typewriter !== null) {
    stopPlayback();
    return;
  }

  startPlayback();
});

finalizeButton.addEventListener('click', finalizeDemo);
sourceInput.addEventListener('input', resetDemo);
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
  if (typewriter !== null) {
    startPlayback();
  }
});

updateModeUi();
syncStatus();
