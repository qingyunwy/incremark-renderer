const QUESTION_RE = /^ {0,3}#{3}\s+(T\d+)\s*[:：]\s*$/u;
const SECTION_RE = /^ {0,3}#{3}\s+(识别题目|答案|解析过程)\s*[:：]\s*$/u;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripLineEnding(line) {
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

function isBlankLine(line) {
  return /^\s*$/.test(stripLineEnding(line));
}

function readLine(src, start) {
  const newline = src.indexOf('\n', start);
  if (newline === -1) {
    return {
      line: src.slice(start),
      next: src.length,
    };
  }

  return {
    line: src.slice(start, newline + 1),
    next: newline + 1,
  };
}

function getFenceStart(line) {
  const match = stripLineEnding(line).match(FENCE_RE);
  const fence = match?.[1];
  if (!fence) {
    return null;
  }

  return {
    marker: fence[0] ?? '`',
    size: fence.length,
  };
}

function isFenceEnd(line, state) {
  return new RegExp(`^ {0,3}${state.marker}{${state.size},}\\s*$`, 'u').test(stripLineEnding(line));
}

function getQuestionOpen(line) {
  const match = stripLineEnding(line).match(QUESTION_RE);
  const id = match?.[1]?.toUpperCase();
  if (!id) {
    return null;
  }

  return {
    id,
    number: Number.parseInt(id.slice(1), 10) || 0,
  };
}

function getSectionOpen(line) {
  const label = stripLineEnding(line).match(SECTION_RE)?.[1];
  switch (label) {
    case '识别题目':
      return {
        key: 'prompt',
        label,
      };
    case '答案':
      return {
        key: 'answer',
        label,
      };
    case '解析过程':
      return {
        key: 'analysis',
        label,
      };
    default:
      return null;
  }
}

function trimSectionText(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && isBlankLine(lines[start] ?? '')) {
    start += 1;
  }

  while (end > start && isBlankLine(lines[end - 1] ?? '')) {
    end -= 1;
  }

  return lines.slice(start, end).join('');
}

export function parseAiSolveQuestions(markdown) {
  const questions = [];
  let currentQuestion = null;
  let currentSection = null;
  let cursor = 0;
  let fenceState = null;

  const flushSection = () => {
    if (!currentQuestion || !currentSection) {
      return;
    }

    currentQuestion.sections.push({
      key: currentSection.key,
      label: currentSection.label,
      text: trimSectionText(currentSection.lines),
    });
  };

  const flushQuestion = () => {
    if (!currentQuestion) {
      return;
    }

    flushSection();
    currentSection = null;
    questions.push(currentQuestion);
  };

  while (cursor < markdown.length) {
    const { line, next } = readLine(markdown, cursor);

    if (fenceState) {
      currentSection?.lines.push(line);
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
      }
      cursor = next;
      continue;
    }

    const fence = getFenceStart(line);
    if (fence) {
      currentSection?.lines.push(line);
      fenceState = fence;
      cursor = next;
      continue;
    }

    const question = getQuestionOpen(line);
    if (question) {
      flushQuestion();
      currentQuestion = {
        id: question.id,
        number: question.number,
        sections: [],
      };
      currentSection = null;
      cursor = next;
      continue;
    }

    const section = getSectionOpen(line);
    if (section && currentQuestion) {
      flushSection();
      currentSection = {
        key: section.key,
        label: section.label,
        lines: [],
      };
      cursor = next;
      continue;
    }

    currentSection?.lines.push(line);
    cursor = next;
  }

  flushQuestion();
  return questions;
}

function renderQuestionMarkdown(question) {
  const sections = question.sections
    .map((section) => {
      const body = section.text.length > 0 ? `\n${section.text}\n` : '\n';
      return `:::ai-solve-${section.key} ${section.label}${body}:::`;
    })
    .join('\n\n');

  const body = sections ? `\n${sections}\n` : '\n';
  return `:::ai-solve-question ${question.id}${body}:::`;
}

export function transformAiSolveMarkdown(markdown) {
  const questions = parseAiSolveQuestions(markdown);
  if (questions.length === 0) {
    return '';
  }

  return questions.map(renderQuestionMarkdown).join('\n\n');
}

export function renderAiSolveContainer(context) {
  if (context.type === 'ai-solve-question') {
    const questionId = context.title?.trim() || 'T0';
    const questionNumber = Number.parseInt(questionId.replace(/^T/u, ''), 10) || 0;
    const content = context.innerHtml
      || '<div class="incremark-ai-solve-question__empty">等待题目结构继续输出...</div>';

    return `<section class="incremark-ai-solve-question" data-ai-solve-question data-question-id="${escapeHtml(questionId)}" data-question-number="${String(questionNumber)}">${content}</section>`;
  }

  if (
    context.type === 'ai-solve-prompt'
    || context.type === 'ai-solve-answer'
    || context.type === 'ai-solve-analysis'
  ) {
    const key = context.type.replace('ai-solve-', '');
    const label = context.title?.trim() || context.info || '';
    const content = context.innerHtml
      || '<div class="incremark-ai-solve-section__placeholder">等待内容继续输出...</div>';

    return `<section class="incremark-ai-solve-section incremark-ai-solve-section-${escapeHtml(key)}" data-ai-solve-section="${escapeHtml(key)}"><h3 class="incremark-ai-solve-section__title">${escapeHtml(label)}</h3><div class="incremark-ai-solve-section__content">${content}</div></section>`;
  }

  return undefined;
}
