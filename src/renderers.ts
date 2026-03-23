import type { Marked } from 'marked';

import type { BlockRenderer, StableBlock } from './types.js';

export class DefaultBlockRenderer implements BlockRenderer {
  private readonly marked: Marked;

  public constructor(marked: Marked) {
    this.marked = marked;
  }

  public renderBlock(block: StableBlock): string {
    return this.marked.parser(block.tokens as Parameters<Marked['parser']>[0]);
  }
}

export function wrapBlockHtml(block: StableBlock, innerHtml: string): string {
  return `<div data-incremark-block="${block.key}" data-stable="${block.stable}">${innerHtml}</div>`;
}
