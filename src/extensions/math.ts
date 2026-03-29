import katex from 'katex';
import type { MarkedExtension } from 'marked';

import type { MathRenderOptions } from '../shared/types.js';

const BLOCK_DOLLAR = '$$';
const BLOCK_BRACKET_OPEN = '\\[';
const BLOCK_BRACKET_CLOSE = '\\]';
const INLINE_DOLLAR = '$';
const INLINE_PAREN_OPEN = '\\(';
const INLINE_PAREN_CLOSE = '\\)';

interface MathToken extends Record<string, unknown> {
  type: 'mathInline' | 'mathBlock';
  raw: string;
  text: string;
  displayMode: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readDelimited(
  src: string,
  open: string,
  close: string,
  allowNewline: boolean,
): { raw: string; text: string } | null {
  if (!src.startsWith(open)) {
    return null;
  }

  let index = open.length;
  while (index < src.length) {
    if (src.startsWith(close, index)) {
      const text = src.slice(open.length, index);
      if (text.trim().length === 0) {
        return null;
      }

      return {
        raw: src.slice(0, index + close.length),
        text,
      };
    }

    if (!allowNewline && src[index] === '\n') {
      return null;
    }

    if (src[index] === '\\') {
      index += 2;
      continue;
    }

    index += 1;
  }

  return null;
}

function renderMath(token: MathToken, options?: MathRenderOptions): string {
  try {
    const markup = katex.renderToString(token.text, {
      ...(options?.katex ?? {}),
      displayMode: token.displayMode,
      output: options?.katex?.output ?? 'mathml',
      throwOnError: options?.katex?.throwOnError ?? true,
    });

    if (token.displayMode) {
      return `<div class="incremark-math incremark-math-block">${markup}</div>`;
    }

    return `<span class="incremark-math incremark-math-inline">${markup}</span>`;
  } catch (error) {
    return escapeHtml(token.raw);
  }
}

// Math support is attached as a marked extension so the lexer/parser pipeline
// remains fully incremental while formulas become first-class tokens.
export function createMathExtension(options?: MathRenderOptions): MarkedExtension {
  return {
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src) {
          const dollar = src.indexOf(BLOCK_DOLLAR);
          const bracket = src.indexOf(BLOCK_BRACKET_OPEN);
          const candidates = [dollar, bracket].filter((value) => value >= 0);
          if (candidates.length === 0) {
            return;
          }
          return Math.min(...candidates);
        },
        tokenizer(src) {
          const dollar = readDelimited(src, BLOCK_DOLLAR, BLOCK_DOLLAR, true);
          if (dollar) {
            return {
              type: 'mathBlock',
              raw: dollar.raw,
              text: dollar.text.trim(),
              displayMode: true,
            } as MathToken;
          }

          const bracket = readDelimited(src, BLOCK_BRACKET_OPEN, BLOCK_BRACKET_CLOSE, true);
          if (bracket) {
            return {
              type: 'mathBlock',
              raw: bracket.raw,
              text: bracket.text.trim(),
              displayMode: true,
            } as MathToken;
          }

          return;
        },
        renderer(token) {
          return renderMath(token as MathToken, options);
        },
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src) {
          const dollar = src.indexOf(INLINE_DOLLAR);
          const paren = src.indexOf(INLINE_PAREN_OPEN);
          const candidates = [dollar, paren].filter((value) => value >= 0);
          if (candidates.length === 0) {
            return;
          }
          return Math.min(...candidates);
        },
        tokenizer(src) {
          if (src.startsWith(BLOCK_DOLLAR)) {
            return;
          }

          const dollar = readDelimited(src, INLINE_DOLLAR, INLINE_DOLLAR, false);
          if (dollar) {
            return {
              type: 'mathInline',
              raw: dollar.raw,
              text: dollar.text.trim(),
              displayMode: false,
            } as MathToken;
          }

          const paren = readDelimited(src, INLINE_PAREN_OPEN, INLINE_PAREN_CLOSE, false);
          if (paren) {
            return {
              type: 'mathInline',
              raw: paren.raw,
              text: paren.text.trim(),
              displayMode: false,
            } as MathToken;
          }

          return;
        },
        renderer(token) {
          return renderMath(token as MathToken, options);
        },
      },
    ],
  };
}
