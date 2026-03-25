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
  defaultHeaderContent: string;
}

export type CodeBlockHeaderRenderer = (
  context: CodeBlockHeaderRenderContext,
) => string | null | undefined;

export interface ContainerToken extends Tokens.Generic {
  type: 'customContainer';
  text: string;
  containerType: string;
  info: string;
  title?: string;
  tokens: Token[];
}

export interface ContainerRenderContext {
  type: string;
  info: string;
  title?: string;
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
}

export interface MathRenderOptions {
  katex?: Omit<KatexOptions, 'displayMode'>;
}
