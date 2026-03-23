import type { BlockExtractionResult } from './types.js';

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SINGLE_LINE_BLOCK_PATTERN =
  /^(#{1,6}\s+.+| {0,3}([-*_])(?:\s*\2){2,}\s*)$/;
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(=+|-+)\s*$/;

interface FenceState {
  marker: string;
  size: number;
}

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

function stripLineEnding(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

function isBlankLine(line: string): boolean {
  return /^\s*$/.test(stripLineEnding(line));
}

function getFenceStart(line: string): FenceState | null {
  const match = stripLineEnding(line).match(FENCE_PATTERN);
  const fence = match?.[1];
  if (!fence) {
    return null;
  }

  return {
    marker: fence[0] ?? '`',
    size: fence.length,
  };
}

function isFenceEnd(line: string, state: FenceState): boolean {
  const trimmed = stripLineEnding(line);
  const pattern = new RegExp(`^ {0,3}${state.marker}{${state.size},}\\s*$`);
  return pattern.test(trimmed);
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

// This detector mirrors incremark's core idea: only advance the stable prefix
// when a block boundary is unquestionably complete, leaving the tail re-lexable.
export function extractStableBlocks(input: string, finalize = false): BlockExtractionResult {
  const { lines, rest } = getCompletedLines(input);
  const stableBlocks: string[] = [];
  const current: string[] = [];
  let fenceState: FenceState | null = null;

  for (const line of lines) {
    // Once inside a fenced block, every completed line belongs to the same unstable
    // region until the matching closing fence appears.
    if (fenceState) {
      current.push(line);
      if (isFenceEnd(line, fenceState)) {
        flushCurrentBlock(stableBlocks, current);
        current.length = 0;
        fenceState = null;
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
