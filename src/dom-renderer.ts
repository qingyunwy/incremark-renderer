import { wrapBlockHtml } from './renderers.js';
import type { RenderPatch, StableBlock, StreamMarkdownOptions } from './types.js';
import { StreamMarkdownRenderer } from './stream-markdown.js';

export class IncrementalDomRenderer {
  private readonly engine: StreamMarkdownRenderer;
  private readonly root: HTMLElement;

  public constructor(root: HTMLElement, options: StreamMarkdownOptions = {}) {
    this.root = root;
    this.engine = new StreamMarkdownRenderer(options);
  }

  public append(chunk: string): RenderPatch[] {
    const patches = this.engine.append(chunk);
    this.applyPatches(patches);
    return patches;
  }

  public setMarkdown(markdown: string): RenderPatch[] {
    const patches = this.engine.setMarkdown(markdown);
    this.applyPatches(patches);
    return patches;
  }

  public finalize(): RenderPatch[] {
    const patches = this.engine.finalize();
    this.applyPatches(patches);
    return patches;
  }

  public reset(): void {
    this.engine.reset();
    this.root.innerHTML = '';
  }

  public getBlocks(): StableBlock[] {
    return this.engine.getBlocks();
  }

  public renderToString(): string {
    return this.engine.renderToString();
  }

  // DOM application stays block-granular: each patch maps to one wrapper element,
  // which keeps unchanged blocks mounted and avoids whole-container repaint work.
  private applyPatches(patches: RenderPatch[]): void {
    for (const patch of patches) {
      if (patch.type === 'remove' && patch.previousBlock) {
        this.getBlockNode(patch.previousBlock.key)?.remove();
        continue;
      }

      if (!patch.block) {
        continue;
      }

      const node = this.createBlockElement(patch.block);
      const reference = this.getBlockChildren()[patch.index] ?? null;

      if (patch.type === 'insert') {
        this.root.insertBefore(node, reference);
        continue;
      }

      if (patch.type === 'replace') {
        const existing = patch.previousBlock
          ? this.getBlockNode(patch.previousBlock.key)
          : this.getBlockNode(patch.key);
        existing?.replaceWith(node);
      }
    }
  }

  private createBlockElement(block: StableBlock): HTMLElement {
    const template = document.createElement('template');
    // Parsing through a template keeps wrapper creation simple while still allowing
    // the block renderer to return arbitrary HTML.
    template.innerHTML = wrapBlockHtml(block, block.html);
    return template.content.firstElementChild as HTMLElement;
  }

  private getBlockNode(key: string): HTMLElement | null {
    return this.root.querySelector(`[data-incremark-block="${key}"]`);
  }

  private getBlockChildren(): HTMLElement[] {
    return Array.from(this.root.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.hasAttribute('data-incremark-block'),
    );
  }
}
