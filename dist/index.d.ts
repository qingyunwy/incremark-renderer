import { KatexOptions } from 'katex';
import { MarkedOptions, MarkedExtension, Marked } from 'marked';

interface StableBlock {
    key: string;
    text: string;
    html: string;
    tokens: TokensList;
    digest: string;
    stable: boolean;
}
type TokensList = Array<Record<string, unknown>>;
interface AstNodePatch {
    path: string;
    kind: 'add' | 'remove' | 'replace';
    prevType?: string;
    nextType?: string;
}
interface RenderPatch {
    type: 'insert' | 'remove' | 'replace';
    key: string;
    index: number;
    block?: StableBlock;
    previousBlock?: StableBlock;
    astPatches?: AstNodePatch[];
}
interface StreamRendererSnapshot {
    blocks: StableBlock[];
    stableCount: number;
    sourceLength: number;
}
interface FullRenderResult {
    html: string;
    blocks: StableBlock[];
    snapshot: StreamRendererSnapshot;
}
interface CodeBlockHeaderRenderContext {
    code: string;
    language?: string;
    declaredLanguage?: string;
    highlighted: boolean;
    defaultHeaderContent: string;
}
type CodeBlockHeaderRenderer = (context: CodeBlockHeaderRenderContext) => string | null | undefined;
interface CodeHighlightOptions {
    autoDetect?: boolean;
    defaultLanguage?: string;
    languages?: string[];
    renderHeader?: CodeBlockHeaderRenderer;
}
interface StreamMarkdownOptions {
    marked?: MarkedOptions;
    math?: MathRenderOptions | false;
    highlight?: CodeHighlightOptions | false;
    renderer?: BlockRenderer;
    plugins?: StreamMarkdownPlugin[];
}
interface BlockRenderer {
    renderBlock(block: StableBlock): string;
}
interface StreamMarkdownPlugin {
    name: string;
    onBlockParsed?(block: StableBlock): StableBlock | void;
    onPatchesComputed?(patches: RenderPatch[], snapshot: StreamRendererSnapshot): void;
}
interface BlockExtractionResult {
    stableBlocks: string[];
    tail: string;
}
interface TypewriterChunkMeta {
    chunk: string;
    chunkSize: number;
    delayMs: number;
    done: boolean;
    closed: boolean;
    inCodeFence: boolean;
    cursor: number;
    total: number;
}
type TypewriterState = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';
interface TypewriterEventMeta {
    state: TypewriterState;
    cursor: number;
    total: number;
    closed: boolean;
    inCodeFence: boolean;
    lastChunk?: string;
}
interface TypewriterOptions {
    baseDelayMs?: number;
    minChunkSize?: number;
    maxChunkSize?: number;
    onChunk: (chunk: string, meta: TypewriterChunkMeta) => void;
    onComplete?: (meta: TypewriterEventMeta) => void;
    onPause?: (meta: TypewriterEventMeta) => void;
    onResume?: (meta: TypewriterEventMeta) => void;
    onStart?: (meta: TypewriterEventMeta) => void;
    onStateChange?: (meta: TypewriterEventMeta) => void;
    onStop?: (meta: TypewriterEventMeta) => void;
}
interface TypewriterCursorOptions {
    className?: string;
    autoScroll?: boolean;
}
interface MathRenderOptions {
    katex?: Omit<KatexOptions, 'displayMode'>;
}

declare function extractStableBlocks(input: string, finalize?: boolean): BlockExtractionResult;

declare function digestTokens(tokens: TokensList): string;
declare function diffAst(previous: TokensList, next: TokensList): AstNodePatch[];

declare class IncrementalDomRenderer {
    private readonly engine;
    private readonly root;
    constructor(root: HTMLElement, options?: StreamMarkdownOptions);
    append(chunk: string): RenderPatch[];
    setMarkdown(markdown: string): RenderPatch[];
    finalize(): RenderPatch[];
    reset(): void;
    getBlocks(): StableBlock[];
    renderToString(): string;
    private applyPatches;
    private createBlockElement;
    private getBlockNode;
    private getBlockChildren;
    private trySyncBlockInPlace;
}

declare function renderMarkdown(markdown: string, options?: StreamMarkdownOptions): FullRenderResult;
declare function renderMarkdownToString(markdown: string, options?: StreamMarkdownOptions): string;

declare function createHighlightExtension(options?: CodeHighlightOptions, runtime?: {
    highlightEnabled?: boolean;
}): MarkedExtension<string, string>;

declare function createMathExtension(options?: MathRenderOptions): MarkedExtension;

declare class DefaultBlockRenderer implements BlockRenderer {
    private readonly marked;
    constructor(marked: Marked);
    renderBlock(block: StableBlock): string;
}
declare function wrapBlockHtml(block: StableBlock, innerHtml: string): string;

declare class StreamMarkdownRenderer {
    private readonly marked;
    private readonly mathEnabled;
    private readonly renderer;
    private readonly plugins;
    private readonly stableBlocks;
    private source;
    private tail;
    private sequence;
    constructor(options?: StreamMarkdownOptions);
    append(chunk: string): RenderPatch[];
    setMarkdown(markdown: string): RenderPatch[];
    finalize(): RenderPatch[];
    reset(): void;
    getSnapshot(): StreamRendererSnapshot;
    getBlocks(): StableBlock[];
    renderToString(): string;
    private reconcile;
    private computeVisibleBlocks;
    private createBlock;
    private diffBlocks;
}

declare class TypewriterCursorController {
    private readonly root;
    private readonly cursor;
    private readonly autoScroll;
    private frame;
    private visible;
    constructor(root: HTMLElement, options?: TypewriterCursorOptions);
    show(): void;
    hide(): void;
    update(): void;
    destroy(): void;
    private readonly handleViewportChange;
}

declare abstract class BaseMarkdownTypewriter {
    protected readonly options: Required<TypewriterOptions>;
    protected timer: ReturnType<typeof setTimeout> | null;
    protected cursor: number;
    protected running: boolean;
    protected state: TypewriterState;
    protected inFence: boolean;
    protected lineCarry: string;
    protected constructor(options: TypewriterOptions);
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
    isRunning(): boolean;
    protected abstract getText(): string;
    protected abstract isInputClosed(): boolean;
    protected kick(): void;
    protected getEventMeta(lastChunk?: string): TypewriterEventMeta;
    protected transition(nextState: TypewriterState, lastChunk?: string): void;
    private scheduleNext;
    private clearTimer;
    private completeIfReady;
    private tick;
}
declare class MarkdownTypewriter extends BaseMarkdownTypewriter {
    private readonly text;
    constructor(text: string, options: TypewriterOptions);
    protected getText(): string;
    protected isInputClosed(): boolean;
}
declare class StreamingMarkdownTypewriter extends BaseMarkdownTypewriter {
    private text;
    private closed;
    constructor(options: TypewriterOptions);
    push(chunk: string): void;
    close(): void;
    isClosed(): boolean;
    protected getText(): string;
    protected isInputClosed(): boolean;
}

export { type AstNodePatch, type BlockExtractionResult, type BlockRenderer, type CodeBlockHeaderRenderContext, type CodeBlockHeaderRenderer, type CodeHighlightOptions, DefaultBlockRenderer, type FullRenderResult, IncrementalDomRenderer, MarkdownTypewriter, type MathRenderOptions, type RenderPatch, type StableBlock, type StreamMarkdownOptions, type StreamMarkdownPlugin, StreamMarkdownRenderer, type StreamRendererSnapshot, StreamingMarkdownTypewriter, type TokensList, type TypewriterChunkMeta, TypewriterCursorController, type TypewriterCursorOptions, type TypewriterEventMeta, type TypewriterOptions, type TypewriterState, createHighlightExtension, createMathExtension, diffAst, digestTokens, extractStableBlocks, renderMarkdown, renderMarkdownToString, wrapBlockHtml };
