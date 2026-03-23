import { Marked } from 'marked';

import { diffAst, digestTokens } from './ast-diff.js';
import { extractStableBlocks } from './block-boundary.js';
import {
  createMathExtension,
  normalizeMathSource,
  restoreOriginalMathRaw,
} from './math.js';
import { DefaultBlockRenderer } from './renderers.js';
import type {
  RenderPatch,
  StableBlock,
  StreamMarkdownOptions,
  StreamRendererSnapshot,
  TokensList,
} from './types.js';

function makeSnapshot(blocks: StableBlock[], sourceLength: number): StreamRendererSnapshot {
  return {
    blocks,
    stableCount: blocks.filter((block) => block.stable).length,
    sourceLength,
  };
}

function cloneBlocks(blocks: StableBlock[]): StableBlock[] {
  return blocks.map((block) => ({ ...block }));
}

export class StreamMarkdownRenderer {
  private readonly marked: Marked;
  private readonly mathEnabled: boolean;
  private readonly renderer: NonNullable<StreamMarkdownOptions['renderer']>;
  private readonly plugins: NonNullable<StreamMarkdownOptions['plugins']>;
  private readonly stableBlocks: StableBlock[] = [];
  private source = '';
  private tail = '';
  private sequence = 0;

  public constructor(options: StreamMarkdownOptions = {}) {
    this.mathEnabled = options.math !== false;
    const mathOptions = options.math === false ? undefined : options.math;
    this.marked =
      this.mathEnabled
        ? new Marked(createMathExtension(mathOptions))
        : new Marked();
    if (options.marked) {
      this.marked.setOptions(options.marked);
    }
    this.renderer = options.renderer ?? new DefaultBlockRenderer(this.marked);
    this.plugins = options.plugins ?? [];
  }

  public append(chunk: string): RenderPatch[] {
    if (!chunk) {
      return [];
    }

    this.source += chunk;
    return this.reconcile(chunk, false);
  }

  public setMarkdown(markdown: string): RenderPatch[] {
    const previousBlocks = this.computeVisibleBlocks();

    this.source = markdown;
    this.tail = '';
    this.sequence = 0;
    this.stableBlocks.length = 0;

    const extraction = extractStableBlocks(markdown, true);
    for (const text of extraction.stableBlocks) {
      this.stableBlocks.push(this.createBlock(text, true));
    }

    const nextBlocks = this.computeVisibleBlocks();
    const patches = this.diffBlocks(previousBlocks, nextBlocks);
    const snapshot = makeSnapshot(cloneBlocks(nextBlocks), this.source.length);
    for (const plugin of this.plugins) {
      plugin.onPatchesComputed?.(patches, snapshot);
    }
    return patches;
  }

  public finalize(): RenderPatch[] {
    return this.reconcile('', true);
  }

  public reset(): void {
    this.source = '';
    this.tail = '';
    this.sequence = 0;
    this.stableBlocks.length = 0;
  }

  public getSnapshot(): StreamRendererSnapshot {
    return makeSnapshot(this.getBlocks(), this.source.length);
  }

  public getBlocks(): StableBlock[] {
    return cloneBlocks(this.computeVisibleBlocks());
  }

  public renderToString(): string {
    return this.computeVisibleBlocks().map((block) => block.html).join('');
  }

  // `reconcile` is the core streaming loop:
  // 1. re-scan only the previous tail plus the incoming chunk
  // 2. freeze any newly stable blocks
  // 3. keep the remaining tail mutable
  // 4. diff previous vs next visible blocks to emit minimal render patches
  private reconcile(incomingChunk: string, finalize: boolean): RenderPatch[] {
    const previousBlocks = this.computeVisibleBlocks();
    const extraction = extractStableBlocks(this.tail + incomingChunk, finalize);
    this.tail = extraction.tail;

    for (const text of extraction.stableBlocks) {
      this.stableBlocks.push(this.createBlock(text, true));
    }

    const nextBlocks = this.computeVisibleBlocks();
    const patches = this.diffBlocks(previousBlocks, nextBlocks);
    const snapshot = makeSnapshot(cloneBlocks(nextBlocks), this.source.length);
    for (const plugin of this.plugins) {
      plugin.onPatchesComputed?.(patches, snapshot);
    }
    return patches;
  }

  private computeVisibleBlocks(): StableBlock[] {
    const blocks = cloneBlocks(this.stableBlocks);
    // The tail is exposed as a synthetic block so UI layers can still render the
    // in-progress fragment while knowing it may be replaced on the next chunk.
    if (this.tail.length > 0) {
      blocks.push(this.createBlock(this.tail, false, 'tail'));
    }
    return blocks;
  }

  private createBlock(text: string, stable: boolean, explicitKey?: string): StableBlock {
    // Each block is lexed independently, so we never re-run marked.lexer for the
    // immutable stable prefix. Only fresh stable blocks and the mutable tail block
    // participate in incremental lexing.
    const normalizedMath = this.mathEnabled ? normalizeMathSource(text) : null;
    const lexingText = normalizedMath?.text ?? text;
    const tokens = this.marked.lexer(lexingText) as TokensList;
    if (normalizedMath) {
      restoreOriginalMathRaw(tokens, normalizedMath.segments);
    }
    const key = explicitKey ?? `block-${this.sequence += 1}`;
    const draft: StableBlock = {
      key,
      text,
      tokens,
      digest: digestTokens(tokens),
      html: '',
      stable,
    };

    let nextBlock = {
      ...draft,
      html: this.renderer.renderBlock(draft),
    };

    // Plugins can enrich metadata or tweak the rendered representation after the
    // core marked-based parse/render pass has completed.
    for (const plugin of this.plugins) {
      nextBlock = plugin.onBlockParsed?.(nextBlock) ?? nextBlock;
    }

    return nextBlock;
  }

  private diffBlocks(previous: StableBlock[], next: StableBlock[]): RenderPatch[] {
    const patches: RenderPatch[] = [];
    const max = Math.max(previous.length, next.length);

    for (let index = 0; index < max; index += 1) {
      const prevBlock = previous[index];
      const nextBlock = next[index];

      if (!prevBlock && nextBlock) {
        patches.push({ type: 'insert', key: nextBlock.key, index, block: nextBlock });
        continue;
      }

      if (prevBlock && !nextBlock) {
        patches.push({ type: 'remove', key: prevBlock.key, index, previousBlock: prevBlock });
        continue;
      }

      if (!prevBlock || !nextBlock) {
        continue;
      }

      if (prevBlock.key !== nextBlock.key) {
        // A key shift means the stable/tail partition changed, so replacing the DOM
        // node is safer than attempting an in-place mutation.
        patches.push({
          type: 'replace',
          key: nextBlock.key,
          index,
          previousBlock: prevBlock,
          block: nextBlock,
          astPatches: diffAst(prevBlock.tokens, nextBlock.tokens),
        });
        continue;
      }

      if (prevBlock.digest !== nextBlock.digest || prevBlock.html !== nextBlock.html) {
        // Digest guards semantic structure; HTML guards custom renderer/plugin output.
        patches.push({
          type: 'replace',
          key: nextBlock.key,
          index,
          previousBlock: prevBlock,
          block: nextBlock,
          astPatches: diffAst(prevBlock.tokens, nextBlock.tokens),
        });
      }
    }

    return patches;
  }
}
