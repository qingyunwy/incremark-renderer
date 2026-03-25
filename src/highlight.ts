import hljs from 'highlight.js';
import type { MarkedExtension, Tokens } from 'marked';

import type {
  CodeBlockRenderContext,
  CodeBlockRenderer,
  CodeBlockHeaderRenderContext,
  CodeHighlightOptions,
} from './types.js';

const TRAILING_NEWLINE_RE = /\n$/u;
const INFO_LANGUAGE_RE = /^\S+/u;
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (character) => HTML_ESCAPES[character] ?? character);
}

function normalizeCodeText(value: string): string {
  return `${value.replace(TRAILING_NEWLINE_RE, '')}\n`;
}

function normalizeLanguage(value?: string): string | undefined {
  return value?.trim().match(INFO_LANGUAGE_RE)?.[0];
}

function buildCodeClassName(language?: string): string {
  const classes = ['hljs'];
  if (language) {
    classes.push(`language-${language}`);
  }

  return classes.map((value) => escapeHtml(value)).join(' ');
}

function buildWrapperAttributes(language?: string): string {
  if (!language) {
    return '';
  }

  return ` data-language="${escapeHtml(language)}"`;
}

function renderLanguageBadge(language?: string): string {
  if (!language) {
    return '';
  }

  return `<span class="incremark-code-language">${escapeHtml(language)}</span>`;
}

function renderCodeBlockHeader(
  options: Pick<CodeBlockHeaderRenderContext, 'code' | 'language' | 'declaredLanguage' | 'highlighted'> &
    Pick<CodeHighlightOptions, 'renderHeader'>,
): { defaultHeaderContent: string; headerHtml: string } {
  const context: CodeBlockHeaderRenderContext = {
    code: options.code,
    language: options.language,
    declaredLanguage: options.declaredLanguage,
    highlighted: options.highlighted,
    defaultHeaderContent: renderLanguageBadge(options.language),
  };
  const customHeader = options.renderHeader?.(context);
  const headerContent = customHeader === undefined ? context.defaultHeaderContent : customHeader;

  if (!headerContent) {
    return {
      defaultHeaderContent: context.defaultHeaderContent,
      headerHtml: '',
    };
  }

  return {
    defaultHeaderContent: context.defaultHeaderContent,
    headerHtml: `<div class="incremark-code-block-header">${headerContent}</div>`,
  };
}

function normalizeRendererMap(
  renderers?: Record<string, CodeBlockRenderer>,
): Record<string, CodeBlockRenderer> | undefined {
  if (!renderers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(renderers)
      .map(([language, renderer]) => [normalizeLanguage(language), renderer] as const)
      .filter((entry): entry is [string, CodeBlockRenderer] => Boolean(entry[0] && entry[1])),
  );
}

function resolveLanguageRenderer(
  renderers: Record<string, CodeBlockRenderer> | undefined,
  declaredLanguage?: string,
  language?: string,
): CodeBlockRenderer | undefined {
  if (!renderers) {
    return undefined;
  }

  const declared = declaredLanguage ? renderers[declaredLanguage] : undefined;
  if (declared) {
    return declared;
  }

  return language ? renderers[language] : undefined;
}

function renderCodeBlock(
  options: {
    bodyHtml: string;
    code: string;
    codeClassName?: string;
    declaredLanguage?: string;
    highlighted: boolean;
    language?: string;
    renderBlock?: CodeHighlightOptions['renderBlock'];
    renderHeader?: CodeHighlightOptions['renderHeader'];
    languageRenderers?: Record<string, CodeBlockRenderer>;
  },
): string {
  const header = renderCodeBlockHeader(options);
  const classAttribute = options.codeClassName ? ` class="${options.codeClassName}"` : '';
  const defaultHtml = `<div class="incremark-code-block"${buildWrapperAttributes(options.language)}>${header.headerHtml}<pre><code${classAttribute}>${options.bodyHtml}</code></pre></div>\n`;
  const context: CodeBlockRenderContext = {
    code: options.code,
    language: options.language,
    declaredLanguage: options.declaredLanguage,
    highlighted: options.highlighted,
    defaultHeaderContent: header.defaultHeaderContent,
    headerHtml: header.headerHtml,
    bodyHtml: options.bodyHtml,
    codeClassName: options.codeClassName,
    defaultHtml,
  };
  const languageRenderer = resolveLanguageRenderer(
    options.languageRenderers,
    options.declaredLanguage,
    options.language,
  );
  const languageHtml = languageRenderer?.(context);
  if (languageHtml !== undefined && languageHtml !== null) {
    return languageHtml;
  }

  const customHtml = options.renderBlock?.(context);
  if (customHtml !== undefined && customHtml !== null) {
    return customHtml;
  }

  return defaultHtml;
}

function getAutoDetectLanguages(options: CodeHighlightOptions): string[] | undefined {
  const languages = options.languages
    ?.map((language) => normalizeLanguage(language))
    .filter((language): language is string => Boolean(language && hljs.getLanguage(language)));

  return languages?.length ? languages : undefined;
}

export function createHighlightExtension(
  options: CodeHighlightOptions = {},
  runtime: { highlightEnabled?: boolean } = {},
): MarkedExtension<string, string> {
  const highlightEnabled = runtime.highlightEnabled !== false;
  const languageRenderers = normalizeRendererMap(options.languageRenderers);

  return {
    renderer: {
      code(token: Tokens.Code): string {
        const sourceCode = token.text;
        const renderedCode = normalizeCodeText(sourceCode);
        const declaredLanguage = normalizeLanguage(token.lang);
        const fallbackLanguage = declaredLanguage
          ? undefined
          : normalizeLanguage(options.defaultLanguage);
        const configuredLanguage = declaredLanguage ?? fallbackLanguage;

        try {
          if (highlightEnabled && configuredLanguage && hljs.getLanguage(configuredLanguage)) {
            const result = hljs.highlight(renderedCode, {
              language: configuredLanguage,
              ignoreIllegals: true,
            });
            return renderCodeBlock({
              bodyHtml: result.value,
              code: sourceCode,
              codeClassName: buildCodeClassName(configuredLanguage),
              declaredLanguage,
              highlighted: true,
              language: configuredLanguage,
              languageRenderers,
              renderBlock: options.renderBlock,
              renderHeader: options.renderHeader,
            });
          }

          if (highlightEnabled && options.autoDetect) {
            const result = hljs.highlightAuto(renderedCode, getAutoDetectLanguages(options));
            if (result.language) {
              return renderCodeBlock({
                bodyHtml: result.value,
                code: sourceCode,
                codeClassName: buildCodeClassName(result.language),
                declaredLanguage,
                highlighted: true,
                language: result.language,
                languageRenderers,
                renderBlock: options.renderBlock,
                renderHeader: options.renderHeader,
              });
            }
          }
        } catch {
          // Fall back to plain escaped code below.
        }

        const plainCode = token.escaped ? renderedCode : escapeHtml(renderedCode);
        const codeClassName = configuredLanguage
          ? `language-${escapeHtml(configuredLanguage)}`
          : undefined;

        return renderCodeBlock({
          bodyHtml: plainCode,
          code: sourceCode,
          codeClassName,
          declaredLanguage,
          highlighted: false,
          language: configuredLanguage,
          languageRenderers,
          renderBlock: options.renderBlock,
          renderHeader: options.renderHeader,
        });
      },
    },
  };
}
