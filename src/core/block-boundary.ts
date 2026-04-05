import type { BlockExtractionResult } from '../shared/types.js';
import type { FenceState } from '../extensions/container-syntax.js';
import {
  getContainerOpen,
  getFenceStart,
  isContainerClose,
  isFenceEnd,
  stripLineEnding,
} from '../extensions/container-syntax.js';

const SINGLE_LINE_BLOCK_PATTERN =
  /^(#{1,6}\s+.+| {0,3}([-*_])(?:\s*\2){2,}\s*)$/;
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(=+|-+)\s*$/;
const INCOMPLETE_CONTAINER_PREFIX_RE = /^ {0,3}:{1,2}$/u;
const CONTAINER_CONTROL_LINE_RE = /^ {0,3}:{3,}[^\n]*$/u;
const INCOMPLETE_FENCE_PREFIX_RE = /^ {0,3}(`{1,2}|~{1,2})$/u;

// Streaming input often ends mid-line. We only treat complete lines as candidates
// for stabilization and leave the last unterminated fragment in `rest`.
function getCompletedLines(input: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let start = 0;

  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '\n') {
      lines.push(input.slice(start, index + 1));
      start = index + 1;
    }
  }

  return {
    lines,
    rest: input.slice(start),
  };
}

function isBlankLine(line: string): boolean {
  return /^\s*$/.test(stripLineEnding(line));
}

// Only eagerly stabilize blocks with very explicit endings. Paragraphs, lists,
// and quotes stay buffered until a blank line arrives so later chunks can extend them.
function classifyBufferedBlock(lines: string[]): 'single' | 'setext' | 'buffered' {
  const firstLine = lines[0];
  if (lines.length === 1 && firstLine && SINGLE_LINE_BLOCK_PATTERN.test(stripLineEnding(firstLine))) {
    return 'single';
  }

  const secondLine = lines[1];
  if (lines.length === 2 && secondLine && SETEXT_UNDERLINE_PATTERN.test(stripLineEnding(secondLine))) {
    return 'setext';
  }

  return 'buffered';
}

function flushCurrentBlock(target: string[], lines: string[]): void {
  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || !isBlankLine(lastLine)) {
      break;
    }
    lines.pop();
  }

  if (lines.length > 0) {
    target.push(lines.join(''));
  }
}

function scanLineLexicalContext(lines: string[]): {
  fenceState: FenceState | null;
  containerStack: number[];
} {
  let fenceState: FenceState | null = null;
  const containerStack: number[] = [];

  for (const line of lines) {
    if (fenceState) {
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
      }
      continue;
    }

    const fence = getFenceStart(line);
    if (fence) {
      fenceState = fence;
      continue;
    }

    const nestedOpen = getContainerOpen(line);
    if (nestedOpen) {
      containerStack.push(nestedOpen.size);
      continue;
    }

    const currentSize = containerStack[containerStack.length - 1];
    if (currentSize && isContainerClose(line, currentSize)) {
      containerStack.pop();
    }
  }

  return {
    fenceState,
    containerStack,
  };
}

function isPotentialContainerControlLine(line: string): boolean {
  const trimmed = stripLineEnding(line);
  return INCOMPLETE_CONTAINER_PREFIX_RE.test(trimmed) || CONTAINER_CONTROL_LINE_RE.test(trimmed);
}

function isPotentialFenceControlLine(line: string): boolean {
  const trimmed = stripLineEnding(line);
  return INCOMPLETE_FENCE_PREFIX_RE.test(trimmed) || getFenceStart(trimmed) !== null;
}

export function getRenderableTail(tail: string): string {
  if (tail.length === 0 || tail.endsWith('\n')) {
    return tail;
  }

  const { lines, rest } = getCompletedLines(tail);
  if (!rest) {
    return tail;
  }

  const context = scanLineLexicalContext(lines);
  if (context.fenceState) {
    return isPotentialFenceControlLine(rest) ? lines.join('') : tail;
  }

  if (context.containerStack.length > 0) {
    return (isPotentialContainerControlLine(rest) || isPotentialFenceControlLine(rest))
      ? lines.join('')
      : tail;
  }

  return (isPotentialContainerControlLine(rest) || isPotentialFenceControlLine(rest))
    ? lines.join('')
    : tail;
}

// This detector mirrors incremark's core idea: only advance the stable prefix
// when a block boundary is unquestionably complete, leaving the tail re-lexable.
export function extractStableBlocks(input: string, finalize = false): BlockExtractionResult {
  const { lines, rest } = getCompletedLines(input);
  const stableBlocks: string[] = [];
  const current: string[] = [];
  let fenceState: FenceState | null = null;
  const containerStack: number[] = [];

  for (const line of lines) {
    // Once inside a fenced block, every completed line belongs to the same unstable
    // region until the matching closing fence appears.
    if (fenceState) {
      current.push(line);
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
        if (containerStack.length === 0) {
          flushCurrentBlock(stableBlocks, current);
          current.length = 0;
        }
      }
      continue;
    }

    if (containerStack.length > 0) {
      current.push(line);

      const start = getFenceStart(line);
      if (start) {
        fenceState = start;
        continue;
      }

      const nestedOpen = getContainerOpen(line);
      if (nestedOpen) {
        containerStack.push(nestedOpen.size);
        continue;
      }

      const currentSize = containerStack[containerStack.length - 1];
      if (currentSize && isContainerClose(line, currentSize)) {
        containerStack.pop();
        if (containerStack.length === 0) {
          flushCurrentBlock(stableBlocks, current);
          current.length = 0;
        }
      }
      continue;
    }

    if (current.length === 0) {
      // Leading blank lines do not carry semantic value for block stability, so we skip
      // them instead of materializing empty blocks.
      if (isBlankLine(line)) {
        continue;
      }

      const start = getFenceStart(line);
      if (start) {
        current.push(line);
        fenceState = start;
        continue;
      }

      const containerOpen = getContainerOpen(line);
      if (containerOpen) {
        current.push(line);
        containerStack.push(containerOpen.size);
        continue;
      }

      current.push(line);
      const type = classifyBufferedBlock(current);
      if (type === 'single') {
        flushCurrentBlock(stableBlocks, current);
        current.length = 0;
      }
      continue;
    }

    current.push(line);
    // A blank line is our strongest signal that the current composite block will no
    // longer be extended by future chunks.
    if (isBlankLine(line)) {
      flushCurrentBlock(stableBlocks, current);
      current.length = 0;
      continue;
    }

    if (classifyBufferedBlock(current) === 'setext') {
      flushCurrentBlock(stableBlocks, current);
      current.length = 0;
    }
  }

  if (finalize) {
    // Finalize is the "stream closed" signal. At this point the remaining tail must be
    // flushed even if it never saw a closing blank line.
    if (rest.length > 0) {
      current.push(rest);
    }
    flushCurrentBlock(stableBlocks, current);
    return { stableBlocks, tail: '' };
  }

  return {
    stableBlocks,
    tail: current.join('') + rest,
  };
}
