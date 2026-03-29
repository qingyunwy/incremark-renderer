import type {
  TypewriterChunkMeta,
  TypewriterEventMeta,
  TypewriterOptions,
  TypewriterState,
} from '../shared/types.js';

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SENTENCE_END_PATTERN = /[.!?。！？]$/;
const CLAUSE_END_PATTERN = /[,;:，；：、]$/;

function startsFenceLine(line: string): boolean {
  return /^ {0,3}(`{3,}|~{3,})/.test(line);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPreferredBreak(char: string): boolean {
  return /\s/.test(char) || /[,.!?;:，。！？；：、`]/.test(char);
}

function isStrongBreak(char: string): boolean {
  return /\n/.test(char) || /[.!?。！？]/.test(char);
}

function findChunkEnd(
  text: string,
  start: number,
  minChunkSize: number,
  maxChunkSize: number,
  inFence: boolean,
): number {
  const minEnd = Math.min(text.length, start + minChunkSize);
  const maxEnd = Math.min(text.length, start + maxChunkSize);
  const target = inFence ? Math.min(maxEnd, start + minChunkSize + 1) : maxEnd;
  let preferred = -1;
  let strong = -1;

  for (let index = minEnd; index < target; index += 1) {
    const char = text[index - 1];
    if (!char) {
      continue;
    }
    if (isStrongBreak(char)) {
      strong = index;
    } else if (isPreferredBreak(char)) {
      preferred = index;
    }
  }

  if (strong !== -1) {
    return strong;
  }

  if (preferred !== -1) {
    return preferred;
  }

  return target;
}

function computeDelay(chunk: string, baseDelayMs: number, inFence: boolean): number {
  const trimmed = chunk.trimEnd();
  const lastChar = trimmed.at(-1) ?? chunk.at(-1) ?? '';
  let delay = baseDelayMs;

  if (trimmed.endsWith('```') || trimmed.endsWith('~~~')) {
    delay += baseDelayMs * 2.4;
  } else if (SENTENCE_END_PATTERN.test(lastChar)) {
    delay += baseDelayMs * 1.8;
  } else if (CLAUSE_END_PATTERN.test(lastChar)) {
    delay += baseDelayMs * 1.1;
  } else if (lastChar === '\n') {
    delay += baseDelayMs * 0.7;
  } else if (/\s/.test(lastChar)) {
    delay += baseDelayMs * 0.2;
  }

  if (inFence) {
    delay += baseDelayMs * 0.35;
  }

  return Math.max(0, Math.round(delay));
}

function updateFenceState(chunk: string, inFence: boolean, carry: string): {
  inFence: boolean;
  carry: string;
} {
  const combined = carry + chunk;
  const lines = combined.split('\n');
  const nextCarry = combined.endsWith('\n') ? '' : (lines.pop() ?? '');
  let nextFence = inFence;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const match = trimmed.match(FENCE_PATTERN);
    const fenceToken = match?.[1];
    if (!fenceToken) {
      continue;
    }

    if (!nextFence) {
      nextFence = true;
      continue;
    }

    const firstFenceChar = fenceToken[0];
    const trimmedBody = trimmed.replace(/^ {0,3}/, '');
    if (firstFenceChar && trimmedBody.startsWith(firstFenceChar)) {
      nextFence = false;
    }
  }

  return {
    inFence: nextFence,
    carry: nextCarry,
  };
}

function normalizeOptions(options: TypewriterOptions): Required<TypewriterOptions> {
  return {
    baseDelayMs: options.baseDelayMs ?? 26,
    minChunkSize: options.minChunkSize ?? 2,
    maxChunkSize: options.maxChunkSize ?? 14,
    onChunk: options.onChunk,
    onComplete: options.onComplete ?? (() => {}),
    onPause: options.onPause ?? (() => {}),
    onResume: options.onResume ?? (() => {}),
    onStart: options.onStart ?? (() => {}),
    onStateChange: options.onStateChange ?? (() => {}),
    onStop: options.onStop ?? (() => {}),
  };
}

// Both typewriter variants share the same adaptive cadence and code-fence tracking,
// so the renderer can respond to playback consistently whether the source is fully
// known up front or arrives incrementally from an upstream stream.
abstract class BaseMarkdownTypewriter {
  protected readonly options: Required<TypewriterOptions>;
  protected timer: ReturnType<typeof setTimeout> | null = null;
  protected cursor = 0;
  protected running = false;
  protected state: TypewriterState = 'idle';
  protected inFence = false;
  protected lineCarry = '';

  protected constructor(options: TypewriterOptions) {
    this.options = normalizeOptions(options);
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.transition('running');
    this.options.onStart(this.getEventMeta());
    this.kick();
  }

  public pause(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.clearTimer();
    this.transition('paused');
    this.options.onPause(this.getEventMeta());
  }

  public resume(): void {
    if (this.running) {
      return;
    }

    if (this.isInputClosed() && this.cursor >= this.getText().length) {
      return;
    }

    this.running = true;
    this.transition('running');
    this.options.onResume(this.getEventMeta());
    this.kick();
  }

  public stop(): void {
    this.running = false;
    this.clearTimer();
    this.cursor = 0;
    this.inFence = false;
    this.lineCarry = '';
    this.transition('stopped');
    this.options.onStop(this.getEventMeta());
  }

  public isRunning(): boolean {
    return this.running;
  }

  protected abstract getText(): string;
  protected abstract isInputClosed(): boolean;

  protected kick(): void {
    if (!this.running || this.timer !== null) {
      return;
    }

    if (this.cursor < this.getText().length) {
      this.scheduleNext(0);
      return;
    }

    this.completeIfReady();
  }

  protected getEventMeta(lastChunk?: string): TypewriterEventMeta {
    const visibleInCodeFence = this.inFence || startsFenceLine(this.lineCarry);
    return {
      state: this.state,
      cursor: this.cursor,
      total: this.getText().length,
      closed: this.isInputClosed(),
      inCodeFence: visibleInCodeFence,
      lastChunk,
    };
  }

  protected transition(nextState: TypewriterState, lastChunk?: string): void {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;
    this.options.onStateChange(this.getEventMeta(lastChunk));
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }

    clearTimeout(this.timer);
    this.timer = null;
  }

  private completeIfReady(lastChunk?: string): void {
    if (!this.isInputClosed() || this.cursor < this.getText().length) {
      return;
    }

    this.running = false;
    this.clearTimer();
    this.transition('completed', lastChunk);
    this.options.onComplete(this.getEventMeta(lastChunk));
  }

  private tick(): void {
    if (!this.running) {
      return;
    }

    const text = this.getText();
    if (this.cursor >= text.length) {
      this.completeIfReady();
      return;
    }

    const progress = text.length === 0 ? 1 : this.cursor / text.length;
    const speedFactor = progress < 0.12 ? 0.55 : progress < 0.82 ? 1 : 0.72;
    const minChunkSize = this.options.minChunkSize;
    const maxChunkSize = clamp(
      Math.round(this.options.maxChunkSize * speedFactor),
      minChunkSize,
      this.options.maxChunkSize,
    );
    const end = findChunkEnd(
      text,
      this.cursor,
      minChunkSize,
      maxChunkSize,
      this.inFence,
    );
    const chunk = text.slice(this.cursor, end);
    this.cursor = end;

    const fenceState = updateFenceState(chunk, this.inFence, this.lineCarry);
    this.inFence = fenceState.inFence;
    this.lineCarry = fenceState.carry;
    const closed = this.isInputClosed();
    const visibleInCodeFence = this.inFence || startsFenceLine(this.lineCarry);
    const done = closed && this.cursor >= this.getText().length;
    const delayMs = done
      ? 0
      : computeDelay(chunk, this.options.baseDelayMs, this.inFence);
    const meta: TypewriterChunkMeta = {
      chunk,
      chunkSize: chunk.length,
      delayMs,
      done,
      closed,
      inCodeFence: visibleInCodeFence,
      cursor: this.cursor,
      total: this.getText().length,
    };

    this.options.onChunk(chunk, meta);

    if (done) {
      this.completeIfReady(chunk);
      return;
    }

    if (this.cursor < this.getText().length) {
      this.scheduleNext(delayMs);
    }
  }
}

// This variant is for replaying an already complete Markdown string, such as
// history playback, demos, or delayed presentation after the full response exists.
export class MarkdownTypewriter extends BaseMarkdownTypewriter {
  private readonly text: string;

  public constructor(text: string, options: TypewriterOptions) {
    super(options);
    this.text = text;
  }

  protected getText(): string {
    return this.text;
  }

  protected isInputClosed(): boolean {
    return true;
  }
}

// This variant accepts upstream chunks in real time. It keeps the same event and
// cadence model as MarkdownTypewriter, but waits when the buffered text is drained
// and only completes after close() marks the stream as finished.
export class StreamingMarkdownTypewriter extends BaseMarkdownTypewriter {
  private text = '';
  private closed = false;

  public constructor(options: TypewriterOptions) {
    super(options);
  }

  public push(chunk: string): void {
    if (this.closed) {
      throw new Error('Cannot push more markdown after close().');
    }

    if (!chunk) {
      return;
    }

    this.text += chunk;
    this.kick();
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.kick();
  }

  public isClosed(): boolean {
    return this.closed;
  }

  protected getText(): string {
    return this.text;
  }

  protected isInputClosed(): boolean {
    return this.closed;
  }
}
