import type { TypewriterCursorOptions } from './types.js';

function getLastBlock(root: HTMLElement): HTMLElement | null {
  const blocks = root.querySelectorAll<HTMLElement>('[data-incremark-block]');
  return blocks.length > 0 ? blocks.item(blocks.length - 1) : null;
}

function getCursorLineHeight(element: HTMLElement): number {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  if (Number.isFinite(lineHeight)) {
    return lineHeight;
  }

  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.4 : 24;
}

function findCaretRect(root: HTMLElement): DOMRect | null {
  const lastBlock = getLastBlock(root);
  if (!lastBlock) {
    return null;
  }

  const walker = document.createTreeWalker(
    lastBlock,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (
          node instanceof HTMLElement &&
          node.classList.contains('incremark-typewriter-cursor')
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent?.trim().length
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }

        return node instanceof HTMLElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    },
  );

  let current = walker.nextNode();
  let lastNode: Node | null = null;
  while (current) {
    lastNode = current;
    current = walker.nextNode();
  }

  if (!lastNode) {
    return null;
  }

  const range = document.createRange();
  if (lastNode.nodeType === Node.TEXT_NODE) {
    const text = lastNode.textContent ?? '';
    range.setStart(lastNode, text.length);
    range.setEnd(lastNode, text.length);
  } else {
    range.selectNodeContents(lastNode);
    range.collapse(false);
  }

  const rects = range.getClientRects();
  const lastRect = rects.length > 0 ? rects.item(rects.length - 1) : null;
  return lastRect ?? lastBlock.getBoundingClientRect();
}

export class TypewriterCursorController {
  private readonly root: HTMLElement;
  private readonly cursor: HTMLSpanElement;
  private readonly autoScroll: boolean;
  private frame: number | null = null;
  private visible = false;

  public constructor(root: HTMLElement, options: TypewriterCursorOptions = {}) {
    this.root = root;
    this.autoScroll = options.autoScroll ?? true;
    this.cursor = document.createElement('span');
    this.cursor.className = options.className ?? 'incremark-typewriter-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');

    if (getComputedStyle(this.root).position === 'static') {
      this.root.style.position = 'relative';
    }

    this.root.append(this.cursor);
    this.hide();
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('scroll', this.handleViewportChange, true);
  }

  public show(): void {
    this.visible = true;
    this.cursor.hidden = false;
    this.update();
  }

  public hide(): void {
    this.visible = false;
    this.cursor.hidden = true;
  }

  public update(): void {
    if (!this.visible) {
      return;
    }

    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
    }

    this.frame = requestAnimationFrame(() => {
      const rect = findCaretRect(this.root);
      const lastBlock = getLastBlock(this.root);
      const rootRect = this.root.getBoundingClientRect();
      const lineHeight = lastBlock ? getCursorLineHeight(lastBlock) : 24;
      const top = rect
        ? rect.bottom - rootRect.top + this.root.scrollTop - lineHeight
        : this.root.scrollTop + 8;
      const left = rect
        ? rect.right - rootRect.left + this.root.scrollLeft + 2
        : this.root.scrollLeft + 8;
      const height = Math.max(18, Math.min(lineHeight, rect?.height ?? lineHeight));

      this.cursor.style.top = `${top}px`;
      this.cursor.style.left = `${left}px`;
      this.cursor.style.height = `${height}px`;

      if (this.autoScroll) {
        const cursorBottom = top + height;
        const viewBottom = this.root.scrollTop + this.root.clientHeight;
        if (cursorBottom > viewBottom - 24) {
          this.root.scrollTop = cursorBottom - this.root.clientHeight + 24;
        }
      }
    });
  }

  public destroy(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('scroll', this.handleViewportChange, true);
    this.cursor.remove();
  }

  private readonly handleViewportChange = (): void => {
    this.update();
  };
}
