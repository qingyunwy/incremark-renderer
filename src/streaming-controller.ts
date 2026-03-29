import { IncrementalDomRenderer } from './dom-renderer.js';
import { TypewriterCursorController } from './typewriter-cursor.js';
import { StreamingMarkdownTypewriter } from './typewriter.js';
import type {
  StableBlock,
  StreamingMarkdownControllerChunkMeta,
  StreamingMarkdownControllerCompleteMeta,
  StreamingMarkdownControllerOptions,
  StreamingMarkdownControllerTypewriterOptions,
  TypewriterCursorOptions,
  TypewriterEventMeta,
} from './types.js';

function normalizeCursorOptions(
  options: StreamingMarkdownControllerOptions,
): TypewriterCursorOptions | null {
  if (options.cursor === false) {
    return null;
  }

  if (options.cursor === true || options.cursor === undefined) {
    return {};
  }

  return options.cursor;
}

export class StreamingMarkdownController {
  private readonly rendererInstance: IncrementalDomRenderer;
  private readonly cursorInstance: TypewriterCursorController | null;
  private readonly autoStart: boolean;
  private readonly autoFinalize: boolean;
  private readonly callbacks: Omit<
    StreamingMarkdownControllerOptions,
    'renderer' | 'typewriter' | 'cursor' | 'autoStart' | 'autoFinalize'
  >;
  private typewriterOptions: StreamingMarkdownControllerTypewriterOptions;
  private typewriterInstance: StreamingMarkdownTypewriter;
  private hasStarted = false;
  private destroyed = false;
  private suppressLifecycleCallbacks = false;

  public constructor(root: HTMLElement, options: StreamingMarkdownControllerOptions = {}) {
    this.autoStart = options.autoStart ?? true;
    this.autoFinalize = options.autoFinalize ?? true;
    this.callbacks = {
      onChunk: options.onChunk,
      onComplete: options.onComplete,
      onPause: options.onPause,
      onResume: options.onResume,
      onStart: options.onStart,
      onStateChange: options.onStateChange,
    };
    this.typewriterOptions = options.typewriter ?? {};
    this.rendererInstance = new IncrementalDomRenderer(root, options.renderer ?? {});

    const cursorOptions = normalizeCursorOptions(options);
    this.cursorInstance = cursorOptions
      ? new TypewriterCursorController(root, cursorOptions)
      : null;
    this.typewriterInstance = this.createTypewriter();
  }

  public get renderer(): IncrementalDomRenderer {
    return this.rendererInstance;
  }

  public get cursorController(): TypewriterCursorController | null {
    return this.cursorInstance;
  }

  public get typewriter(): StreamingMarkdownTypewriter {
    return this.typewriterInstance;
  }

  public start(): void {
    this.ensureAlive();
    this.hasStarted = true;
    this.typewriterInstance.start();
  }

  public pause(): void {
    this.ensureAlive();
    this.typewriterInstance.pause();
  }

  public resume(): void {
    this.ensureAlive();
    this.typewriterInstance.resume();
  }

  public push(chunk: string): void {
    this.ensureAlive();
    this.typewriterInstance.push(chunk);

    if (this.autoStart && !this.hasStarted) {
      this.start();
    }
  }

  public close(): void {
    this.ensureAlive();
    this.typewriterInstance.close();

    if (this.autoStart && !this.hasStarted) {
      this.start();
    }
  }

  public setTypewriterOptions(options: StreamingMarkdownControllerTypewriterOptions = {}): void {
    this.ensureAlive();
    this.stopTypewriterSilently();
    this.cursorInstance?.hide();
    this.typewriterOptions = options;
    this.typewriterInstance = this.createTypewriter();
    this.hasStarted = false;
  }

  public reset(): void {
    this.ensureAlive();
    this.stopTypewriterSilently();
    this.rendererInstance.reset();
    this.cursorInstance?.hide();
    this.typewriterInstance = this.createTypewriter();
    this.hasStarted = false;
  }

  public isRunning(): boolean {
    this.ensureAlive();
    return this.typewriterInstance.isRunning();
  }

  public isClosed(): boolean {
    this.ensureAlive();
    return this.typewriterInstance.isClosed();
  }

  public getBlocks(): StableBlock[] {
    this.ensureAlive();
    return this.rendererInstance.getBlocks();
  }

  public renderToString(): string {
    this.ensureAlive();
    return this.rendererInstance.renderToString();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.stopTypewriterSilently();
    this.cursorInstance?.destroy();
    this.destroyed = true;
  }

  private createTypewriter(): StreamingMarkdownTypewriter {
    return new StreamingMarkdownTypewriter({
      ...this.typewriterOptions,
      onChunk: (chunk, meta) => {
        const patches = this.rendererInstance.append(chunk);
        this.syncCursor(meta);
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        const payload: StreamingMarkdownControllerChunkMeta = {
          ...meta,
          patches,
        };
        this.callbacks.onChunk?.(chunk, payload);
      },
      onComplete: (meta) => {
        const patches = this.autoFinalize ? this.rendererInstance.finalize() : [];
        this.cursorInstance?.hide();
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        const payload: StreamingMarkdownControllerCompleteMeta = {
          ...meta,
          patches,
        };
        this.callbacks.onComplete?.(payload);
      },
      onPause: (meta) => {
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        this.callbacks.onPause?.(meta);
      },
      onResume: (meta) => {
        this.syncCursor(meta);
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        this.callbacks.onResume?.(meta);
      },
      onStart: (meta) => {
        this.syncCursor(meta);
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        this.callbacks.onStart?.(meta);
      },
      onStateChange: (meta) => {
        if (this.suppressLifecycleCallbacks) {
          return;
        }

        this.callbacks.onStateChange?.(meta);
      },
    });
  }

  private syncCursor(meta: Pick<TypewriterEventMeta, 'inCodeFence' | 'total'>): void {
    if (!this.cursorInstance) {
      return;
    }

    if (meta.inCodeFence || meta.total === 0) {
      this.cursorInstance.hide();
      return;
    }

    this.cursorInstance.show();
    this.cursorInstance.update();
  }

  private stopTypewriterSilently(): void {
    this.suppressLifecycleCallbacks = true;
    this.typewriterInstance.stop();
    this.suppressLifecycleCallbacks = false;
  }

  private ensureAlive(): void {
    if (this.destroyed) {
      throw new Error('StreamingMarkdownController has been destroyed.');
    }
  }
}
