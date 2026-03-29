import { wrapBlockHtml } from '../core/renderers.js';
import type { RenderPatch, StableBlock, StreamMarkdownOptions } from '../shared/types.js';
import { StreamMarkdownRenderer } from '../core/stream-markdown.js';

interface AttributeSyncPair {
  current: Element;
  next: Element;
}

interface TextSyncPatch {
  current: Text;
  nextValue: string;
}

function syncAttributes(current: Element, next: Element): void {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
}

function collectInPlaceSync(
  current: Node,
  next: Node,
  attributePairs: AttributeSyncPair[],
  textPatches: TextSyncPatch[],
): boolean {
  if (current.nodeType !== next.nodeType) {
    return false;
  }

  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    textPatches.push({
      current: current as Text,
      nextValue: next.textContent ?? '',
    });
    return true;
  }

  if (!(current instanceof Element) || !(next instanceof Element)) {
    return false;
  }

  if (current.tagName !== next.tagName || current.childNodes.length !== next.childNodes.length) {
    return false;
  }

  attributePairs.push({ current, next });

  for (let index = 0; index < current.childNodes.length; index += 1) {
    if (
      !collectInPlaceSync(
        current.childNodes[index] as Node,
        next.childNodes[index] as Node,
        attributePairs,
        textPatches,
      )
    ) {
      return false;
    }
  }

  return true;
}

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
        if (!existing) {
          continue;
        }

        if (!this.trySyncBlockInPlace(existing, node)) {
          existing.replaceWith(node);
        }
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

  private trySyncBlockInPlace(existing: HTMLElement, next: HTMLElement): boolean {
    const attributePairs: AttributeSyncPair[] = [];
    const textPatches: TextSyncPatch[] = [];

    if (!collectInPlaceSync(existing, next, attributePairs, textPatches)) {
      return false;
    }

    for (const pair of attributePairs) {
      syncAttributes(pair.current, pair.next);
    }

    for (const patch of textPatches) {
      if (patch.current.data !== patch.nextValue) {
        patch.current.data = patch.nextValue;
      }
    }

    return true;
  }
}
