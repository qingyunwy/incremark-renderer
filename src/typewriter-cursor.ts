import type { TypewriterCursorOptions, TypewriterCursorVariant } from './types.js';

interface CaretMetrics {
  rect: DOMRect;
  lineHeight: number;
  fontSize: number;
}

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

function getCursorFontSize(element: HTMLElement): number {
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(fontSize) ? fontSize : 16;
}

function getBarCursorWidth(height: number): number {
  return Math.max(2, Math.min(4, Math.round(height * 0.12)));
}

function getCircleCursorDiameter(height: number, fontSize: number, rectHeight: number): number {
  const sizeBasis = Math.max(height, fontSize, rectHeight);
  return Math.max(10, Math.min(30, Math.round(sizeBasis * 0.46)));
}

function needsMarkerMeasurement(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) {
    return true;
  }

  const text = node.textContent ?? '';
  return text.endsWith('\n');
}

function measureRangeWithMarker(range: Range): DOMRect | null {
  const marker = document.createElement('span');
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = '\u200b';
  marker.style.display = 'inline-block';
  marker.style.width = '0';
  marker.style.height = '1em';
  marker.style.overflow = 'hidden';
  marker.style.opacity = '0';
  marker.style.pointerEvents = 'none';
  marker.style.userSelect = 'none';
  marker.style.verticalAlign = 'baseline';

  range.insertNode(marker);
  const normalizeTarget = marker.parentNode;
  const rect = marker.getBoundingClientRect();
  marker.remove();
  normalizeTarget?.normalize();

  return (rect.width || rect.height) ? rect : null;
}

function getCaretContextElement(lastNode: Node, lastBlock: HTMLElement): HTMLElement {
  if (lastNode instanceof Text) {
    return lastNode.parentElement ?? lastBlock;
  }

  return lastNode instanceof HTMLElement ? lastNode : lastBlock;
}

function findCaretMetrics(root: HTMLElement): CaretMetrics | null {
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

  const lineHeight = getCursorLineHeight(getCaretContextElement(lastNode, lastBlock));
  const fontSize = getCursorFontSize(getCaretContextElement(lastNode, lastBlock));
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
  if (lastRect && !needsMarkerMeasurement(lastNode)) {
    return { rect: lastRect, lineHeight, fontSize };
  }

  const rect = measureRangeWithMarker(range) ?? lastRect ?? lastBlock.getBoundingClientRect();
  return { rect, lineHeight, fontSize };
}

export class TypewriterCursorController {
  private readonly root: HTMLElement;
  private readonly cursor: HTMLSpanElement;
  private readonly autoScroll: boolean;
  private readonly variant: TypewriterCursorVariant;
  private frame: number | null = null;
  private visible = false;

  public constructor(root: HTMLElement, options: TypewriterCursorOptions = {}) {
    this.root = root;
    this.autoScroll = options.autoScroll ?? true;
    this.variant = options.variant ?? 'bar';
    this.cursor = document.createElement('span');
    this.cursor.className = options.className ?? 'incremark-typewriter-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.cursor.dataset.incremarkCursorVariant = this.variant;

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
    this.ensureAttached();
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

    this.ensureAttached();

    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
    }

    this.frame = requestAnimationFrame(() => {
      const metrics = findCaretMetrics(this.root);
      const rootRect = this.root.getBoundingClientRect();
      const rect = metrics?.rect ?? null;
      const lineHeight = metrics?.lineHeight ?? 24;
      const fontSize = metrics?.fontSize ?? 16;
      const rectHeight = rect?.height ?? fontSize;
      const height = Math.max(18, Math.min(lineHeight, Math.max(fontSize, rectHeight * 0.92)));
      const width = this.variant === 'circle'
        ? getCircleCursorDiameter(height, fontSize, rectHeight)
        : getBarCursorWidth(height);
      const inlineOffset = this.variant === 'circle'
        ? Math.max(3, Math.round(width * 0.18))
        : 2;
      const top = rect
        ? rect.top - rootRect.top + this.root.scrollTop + ((rectHeight - height) / 2)
        : this.root.scrollTop + 8 + Math.max(0, (lineHeight - height) / 2);
      const left = rect
        ? rect.right - rootRect.left + this.root.scrollLeft + inlineOffset
        : this.root.scrollLeft + 8;
      const resolvedHeight = this.variant === 'circle' ? width : height;
      const resolvedTop = this.variant === 'circle'
        ? top + Math.max(0, (height - resolvedHeight) / 2)
        : top;

      this.cursor.style.transform = `translate3d(${left}px, ${resolvedTop}px, 0)`;
      this.cursor.style.width = `${width}px`;
      this.cursor.style.height = `${resolvedHeight}px`;

      if (this.autoScroll) {
        const cursorBottom = resolvedTop + resolvedHeight;
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

  private ensureAttached(): void {
    if (this.cursor.parentElement !== this.root) {
      this.root.append(this.cursor);
    }
  }
}
