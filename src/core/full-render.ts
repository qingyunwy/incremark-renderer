import { StreamMarkdownRenderer } from './stream-markdown.js';
import type { FullRenderResult, StreamMarkdownOptions } from '../shared/types.js';

export function renderMarkdown(
  markdown: string,
  options: StreamMarkdownOptions = {},
): FullRenderResult {
  const renderer = new StreamMarkdownRenderer(options);
  renderer.setMarkdown(markdown);

  return {
    html: renderer.renderToString(),
    blocks: renderer.getBlocks(),
    snapshot: renderer.getSnapshot(),
  };
}

export function renderMarkdownToString(
  markdown: string,
  options: StreamMarkdownOptions = {},
): string {
  return renderMarkdown(markdown, options).html;
}
