import type { KatexOptions } from 'katex';
import type { MarkedOptions, Token, Tokens } from 'marked';

export interface StableBlock {
  key: string;
  text: string;
  html: string;
  tokens: TokensList;
  digest: string;
  stable: boolean;
}

export type TokensList = Array<Record<string, unknown>>;

export interface AstNodePatch {
  path: string;
  kind: 'add' | 'remove' | 'replace';
  prevType?: string;
  nextType?: string;
}

export interface RenderPatch {
  type: 'insert' | 'remove' | 'replace';
  key: string;
  index: number;
  block?: StableBlock;
  previousBlock?: StableBlock;
  astPatches?: AstNodePatch[];
}

export interface StreamRendererSnapshot {
  blocks: StableBlock[];
  stableCount: number;
  sourceLength: number;
}

export interface FullRenderResult {
  html: string;
  blocks: StableBlock[];
  snapshot: StreamRendererSnapshot;
}

export type HtmlSanitizer = (html: string) => string;

export interface HtmlSanitizeOptions {
  sanitizer?: HtmlSanitizer;
}

export interface CodeBlockHeaderRenderContext {
  code: string;
  language?: string;
  declaredLanguage?: string;
  highlighted: boolean;
  closed: boolean;
  defaultHeaderContent: string;
}

export type CodeBlockHeaderRenderer = (
  context: CodeBlockHeaderRenderContext,
) => string | null | undefined;

export interface CodeBlockRenderContext {
  code: string;
  language?: string;
  declaredLanguage?: string;
  highlighted: boolean;
  closed: boolean;
  defaultHeaderContent: string;
  headerHtml: string;
  bodyHtml: string;
  codeClassName?: string;
  defaultHtml: string;
}

export type CodeBlockRenderer = (
  context: CodeBlockRenderContext,
) => string | null | undefined;

export interface CodeBlockToken extends Tokens.Code {
  closed: boolean;
}

export interface ContainerToken extends Tokens.Generic {
  type: 'customContainer';
  text: string;
  containerType: string;
  info: string;
  title?: string;
  closed: boolean;
  tokens: Token[];
}

export interface ContainerRenderContext {
  type: string;
  info: string;
  title?: string;
  closed: boolean;
  raw: string;
  text: string;
  innerHtml: string;
  defaultClassName: string;
}

export type ContainerRenderer = (
  context: ContainerRenderContext,
) => string | null | undefined;

export interface ContainerOptions {
  render?: ContainerRenderer;
}

export interface CodeHighlightOptions {
  autoDetect?: boolean;
  defaultLanguage?: string;
  languages?: string[];
  renderHeader?: CodeBlockHeaderRenderer;
  renderBlock?: CodeBlockRenderer;
  languageRenderers?: Record<string, CodeBlockRenderer>;
}

export interface StreamMarkdownOptions {
  marked?: MarkedOptions;
  sanitizeHtml?: HtmlSanitizeOptions | false;
  container?: ContainerOptions | false;
  math?: MathRenderOptions | false;
  highlight?: CodeHighlightOptions | false;
  renderer?: BlockRenderer;
  plugins?: StreamMarkdownPlugin[];
}

export interface BlockRenderer {
  renderBlock(block: StableBlock): string;
}

export interface StreamMarkdownPlugin {
  name: string;
  onBlockParsed?(block: StableBlock): StableBlock | void;
  onPatchesComputed?(patches: RenderPatch[], snapshot: StreamRendererSnapshot): void;
}

export interface BlockExtractionResult {
  stableBlocks: string[];
  tail: string;
}

export interface TypewriterChunkMeta {
  chunk: string;
  chunkSize: number;
  delayMs: number;
  done: boolean;
  closed: boolean;
  inCodeFence: boolean;
  cursor: number;
  total: number;
}

export type TypewriterState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped';

export interface TypewriterEventMeta {
  state: TypewriterState;
  cursor: number;
  total: number;
  closed: boolean;
  inCodeFence: boolean;
  lastChunk?: string;
}

export interface TypewriterOptions {
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

export interface TypewriterCursorOptions {
  className?: string;
  autoScroll?: boolean;
  variant?: TypewriterCursorVariant;
}

export type TypewriterCursorVariant = 'bar' | 'circle';

export type StreamingMarkdownControllerTypewriterOptions = Omit<
  TypewriterOptions,
  | 'onChunk'
  | 'onComplete'
  | 'onPause'
  | 'onResume'
  | 'onStart'
  | 'onStateChange'
  | 'onStop'
>;

export interface StreamingMarkdownControllerChunkMeta extends TypewriterChunkMeta {
  patches: RenderPatch[];
}

export interface StreamingMarkdownControllerCompleteMeta extends TypewriterEventMeta {
  patches: RenderPatch[];
}

export interface StreamingMarkdownControllerOptions {
  renderer?: StreamMarkdownOptions;
  typewriter?: StreamingMarkdownControllerTypewriterOptions;
  cursor?: TypewriterCursorOptions | boolean;
  autoStart?: boolean;
  autoFinalize?: boolean;
  onChunk?: (chunk: string, meta: StreamingMarkdownControllerChunkMeta) => void;
  onComplete?: (meta: StreamingMarkdownControllerCompleteMeta) => void;
  onPause?: (meta: TypewriterEventMeta) => void;
  onResume?: (meta: TypewriterEventMeta) => void;
  onStart?: (meta: TypewriterEventMeta) => void;
  onStateChange?: (meta: TypewriterEventMeta) => void;
}

export interface MathRenderOptions {
  katex?: Omit<KatexOptions, 'displayMode'>;
}
