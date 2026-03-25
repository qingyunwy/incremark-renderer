import type { MarkedExtension, Token } from 'marked';

import {
  type FenceState,
  getContainerOpen,
  getFenceStart,
  isContainerClose,
  isFenceEnd,
} from './container-syntax.js';
import type {
  ContainerOptions,
  ContainerRenderContext,
  ContainerToken,
} from './types.js';

const CONTAINER_START_RE = /(^|\n) {0,3}:{3,}(?:(?=[^\s:\n])|[ \t]+(?=\S))/u;
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (character) => HTML_ESCAPES[character] ?? character);
}

function sanitizeClassNameSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, '-');
  return normalized.replace(/^-+|-+$/gu, '') || 'default';
}

function readLine(src: string, start: number): { line: string; next: number } {
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

function buildDefaultClassName(type: string): string {
  return `incremark-container incremark-container-${sanitizeClassNameSegment(type)}`;
}

function renderDefaultContainer(context: ContainerRenderContext): string {
  const titleHtml = context.title
    ? `<div class="incremark-container-title">${escapeHtml(context.title)}</div>`
    : '';

  return `<div class="${context.defaultClassName}" data-container-type="${escapeHtml(context.type)}">${titleHtml}<div class="incremark-container-content">${context.innerHtml}</div></div>\n`;
}

function scanContainer(src: string): Omit<ContainerToken, 'tokens'> | null {
  const firstLine = readLine(src, 0);
  const opening = getContainerOpen(firstLine.line);
  if (!opening) {
    return null;
  }

  const containerStack = [opening.size];
  const contentStart = firstLine.next;
  let cursor = firstLine.next;
  let fenceState: FenceState | null = null;

  while (cursor < src.length) {
    const { line, next } = readLine(src, cursor);

    if (fenceState) {
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
      }
      cursor = next;
      continue;
    }

    const fence = getFenceStart(line);
    if (fence) {
      fenceState = fence;
      cursor = next;
      continue;
    }

    const nestedOpen = getContainerOpen(line);
    if (nestedOpen) {
      containerStack.push(nestedOpen.size);
      cursor = next;
      continue;
    }

    const currentSize = containerStack[containerStack.length - 1];
    if (currentSize && isContainerClose(line, currentSize)) {
      containerStack.pop();

      if (containerStack.length === 0) {
        return {
          type: 'customContainer',
          raw: src.slice(0, next),
          text: src.slice(contentStart, cursor),
          containerType: opening.type,
          info: opening.info,
          title: opening.title,
        };
      }
    }

    cursor = next;
  }

  return null;
}

export function createContainerExtension(
  options: ContainerOptions = {},
): MarkedExtension<string, string> {
  return {
    extensions: [
      {
        name: 'customContainer',
        level: 'block',
        start(src) {
          const match = src.match(CONTAINER_START_RE);
          if (!match) {
            return;
          }

          return match.index === undefined
            ? undefined
            : match.index + (match[1]?.length ?? 0);
        },
        tokenizer(src) {
          const token = scanContainer(src);
          if (!token) {
            return;
          }

          return {
            ...token,
            tokens: this.lexer.blockTokens(token.text, [] as Token[]),
          } as ContainerToken;
        },
        renderer(token) {
          const container = token as unknown as ContainerToken;
          const innerHtml = this.parser.parse(container.tokens);
          const context: ContainerRenderContext = {
            type: container.containerType,
            info: container.info,
            title: container.title,
            raw: container.raw,
            text: container.text,
            innerHtml,
            defaultClassName: buildDefaultClassName(container.containerType),
          };
          const customHtml = options.render?.(context);

          return customHtml === null || customHtml === undefined
            ? renderDefaultContainer(context)
            : customHtml;
        },
        childTokens: ['tokens'],
      },
    ],
  };
}
