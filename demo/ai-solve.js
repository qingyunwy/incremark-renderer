import { IncrementalDomRenderer } from 'incremark-renderer';
import {
  renderAiSolveContainer,
  transformAiSolveMarkdown,
} from './ai-solve-extension.js';

const SAMPLE_MARKDOWN = `### T1:
### 识别题目：
已知$a = 3^{0.1}$，$b = 0.1^3$，$c = \\log_5 0.1$，则（）
A. $a>c>b$
B. $a>b>c$
C. $b>a>c$
D. $c>b>a$
### 答案:
$\\boxed{B}$
### 解析过程:
我们可以根据指数函数和对数函数的单调性，分别判断$a,b,c$和$0,1$的大小关系：
1. 对于$a=3^{0.1}$：指数函数$y=3^x$是$\\mathbb{R}$上的增函数，$0.1>0$，因此$3^{0.1}>3^0=1$，即$a>1$。
2. 对于$b=0.1^3$：指数函数$y=0.1^x$是$\\mathbb{R}$上的减函数，$3>0$，因此$0<0.1^3<0.1^0=1$，即$0<b<1$。
3. 对于$c=\\log_5 0.1$：对数函数$y=\\log_5 x$是$(0,+\\infty)$上的增函数，$0.1<1$，因此$\\log_5 0.1<\\log_5 1=0$，即$c<0$。

综上可得$a>b>c$。

### T2:
### 识别题目：
设$x\\in\\mathbb{R}$，向量$\\boxed{a}=(x,1)$，$\\boxed{b}=(4,x)$，则$x=2$是$\\boxed{a}\\parallel\\boxed{b}$的（）
A. 充分不必要条件
B. 必要不充分条件
C. 充要条件
D. 既不充分也不必要条件
### 答案:
$\\boxed{A}$
### 解析过程:
首先根据向量平行的坐标条件，求出$\\boxed{a}\\parallel\\boxed{b}$的等价条件：
两个向量$\\boxed{a}=(x_1,y_1),\\boxed{b}=(x_2,y_2)$平行的充要条件是$x_1y_2 - x_2y_1=0$，代入本题得：
$$
x\\cdot x - 4\\cdot 1=0 \\implies x^2=4 \\implies x=\\pm 2
$$

接下来判断充分性和必要性：
1. 充分性：若$x=2$，满足$x=\\pm 2$，因此$\\boxed{a}\\parallel\\boxed{b}$成立，充分性成立。
2. 必要性：若$\\boxed{a}\\parallel\\boxed{b}$，则$x=2$或$x=-2$，推不出$x=2$，必要性不成立。

因此$x=2$是$\\boxed{a}\\parallel\\boxed{b}$的充分不必要条件。`;

const sourceInput = document.querySelector('#source-input');
const chunkSizeInput = document.querySelector('#chunk-size');
const playIntervalInput = document.querySelector('#play-interval');
const renderButton = document.querySelector('#render-button');
const playButton = document.querySelector('#play-button');
const resetButton = document.querySelector('#reset-button');
const summaryText = document.querySelector('#summary-text');
const questionNav = document.querySelector('#question-nav');
const previewRoot = document.querySelector('#preview-root');
const emptyState = document.querySelector('#empty-state');

if (
  !(sourceInput instanceof HTMLTextAreaElement) ||
  !(chunkSizeInput instanceof HTMLInputElement) ||
  !(playIntervalInput instanceof HTMLInputElement) ||
  !(renderButton instanceof HTMLButtonElement) ||
  !(playButton instanceof HTMLButtonElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(summaryText instanceof HTMLElement) ||
  !(questionNav instanceof HTMLElement) ||
  !(previewRoot instanceof HTMLElement) ||
  !(emptyState instanceof HTMLElement)
) {
  throw new Error('AI solve demo failed to initialize.');
}

sourceInput.value = SAMPLE_MARKDOWN;

let controller = createController();
let activeQuestionId = null;
let renderTimer = null;
let playTimer = null;

function getRendererOptions() {
  return {
    container: {
      render: renderAiSolveContainer,
    },
    highlight: false,
  };
}

function getChunkSize() {
  const value = Number.parseInt(chunkSizeInput.value, 10);
  if (!Number.isFinite(value)) {
    return 36;
  }

  return Math.max(1, Math.min(240, value));
}

function getPlayInterval() {
  const value = Number.parseInt(playIntervalInput.value, 10);
  if (!Number.isFinite(value)) {
    return 22;
  }

  return Math.max(8, value);
}

function createController() {
  return new IncrementalDomRenderer(previewRoot, getRendererOptions());
}

function recreateController() {
  stopPlayback();
  controller.reset();
  previewRoot.innerHTML = '';
}

function getSource() {
  return sourceInput.value;
}

function setActiveQuestion(questionId, options = {}) {
  activeQuestionId = questionId;

  const blocks = Array.from(previewRoot.children).filter(
    (node) => node instanceof HTMLElement,
  );

  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) {
      continue;
    }

    const question = block.querySelector('[data-ai-solve-question]');
    if (!(question instanceof HTMLElement)) {
      block.hidden = false;
      continue;
    }

    const isActive = question.dataset.questionId === questionId;
    block.hidden = !isActive;
    question.dataset.active = String(isActive);
  }

  for (const button of questionNav.querySelectorAll('[data-question-id]')) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    const isActive = button.dataset.questionId === questionId;
    button.dataset.active = String(isActive);
    button.setAttribute('aria-selected', String(isActive));
  }

  if (options.scrollToTop !== false) {
    previewRoot.scrollTop = 0;
  }
}

function buildQuestionNav(questions) {
  questionNav.innerHTML = '';

  for (const question of questions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-solve-question-chip';
    button.dataset.questionId = question.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-label', `切换到第 ${question.number} 题`);
    button.textContent = String(question.number);
    questionNav.append(button);
  }
}

function syncQuestionShell() {
  const questionNodes = Array.from(previewRoot.querySelectorAll('[data-ai-solve-question]'))
    .filter((node) => node instanceof HTMLElement);
  const questions = questionNodes.map((node) => ({
    id: node.dataset.questionId ?? '',
    number: Number.parseInt(node.dataset.questionNumber ?? '', 10) || 0,
  })).filter((question) => Boolean(question.id));

  if (questions.length === 0) {
    summaryText.textContent = '暂未识别到题目';
    questionNav.innerHTML = '';
    emptyState.hidden = false;
    activeQuestionId = null;
    return;
  }

  emptyState.hidden = true;
  summaryText.textContent = `共识别并解决了 ${questions.length} 道题`;
  buildQuestionNav(questions);

  const nextActive = questions.some((question) => question.id === activeQuestionId)
    ? activeQuestionId
    : questions[0]?.id ?? null;

  if (!nextActive) {
    return;
  }

  setActiveQuestion(nextActive, { scrollToTop: false });
}

function renderNow() {
  recreateController();
  controller.setMarkdown(transformAiSolveMarkdown(getSource()));
  syncQuestionShell();
}

function playStream() {
  recreateController();
  const source = getSource();
  let cursor = 0;

  const tick = () => {
    cursor = Math.min(source.length, cursor + getChunkSize());
    controller.setMarkdown(transformAiSolveMarkdown(source.slice(0, cursor)));
    syncQuestionShell();

    if (cursor >= source.length) {
      playTimer = null;
      return;
    }

    playTimer = window.setTimeout(tick, getPlayInterval());
  };

  tick();
}

function restoreSample() {
  sourceInput.value = SAMPLE_MARKDOWN;
  renderNow();
}

function scheduleRender() {
  stopPlayback();

  if (renderTimer !== null) {
    window.clearTimeout(renderTimer);
  }

  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    renderNow();
  }, 180);
}

function stopPlayback() {
  if (playTimer !== null) {
    window.clearTimeout(playTimer);
    playTimer = null;
  }
}

questionNav.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest('[data-question-id]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const questionId = button.dataset.questionId;
  if (!questionId) {
    return;
  }

  setActiveQuestion(questionId);
});

renderButton.addEventListener('click', () => {
  renderNow();
});

playButton.addEventListener('click', () => {
  playStream();
});

resetButton.addEventListener('click', () => {
  restoreSample();
});

sourceInput.addEventListener('input', () => {
  scheduleRender();
});

renderNow();
