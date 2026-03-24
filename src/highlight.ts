import hljs from 'highlight.js';
import type { MarkedExtension, Tokens } from 'marked';

import type {
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
): string {
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
    return '';
  }

  return `<div class="incremark-code-block-header">${headerContent}</div>`;
}

function renderCodeBlock(
  html: string,
  options: {
    classes?: string;
    code: string;
    declaredLanguage?: string;
    highlighted: boolean;
    language?: string;
    renderHeader?: CodeHighlightOptions['renderHeader'];
  },
): string {
  const classAttribute = options.classes ? ` class="${options.classes}"` : '';
  return `<div class="incremark-code-block"${buildWrapperAttributes(options.language)}>${renderCodeBlockHeader(options)}<pre><code${classAttribute}>${html}</code></pre></div>\n`;
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
            return renderCodeBlock(result.value, {
              classes: buildCodeClassName(configuredLanguage),
              code: sourceCode,
              declaredLanguage,
              highlighted: true,
              language: configuredLanguage,
              renderHeader: options.renderHeader,
            });
          }

          if (highlightEnabled && options.autoDetect) {
            const result = hljs.highlightAuto(renderedCode, getAutoDetectLanguages(options));
            if (result.language) {
              return renderCodeBlock(result.value, {
                classes: buildCodeClassName(result.language),
                code: sourceCode,
                declaredLanguage,
                highlighted: true,
                language: result.language,
                renderHeader: options.renderHeader,
              });
            }
          }
        } catch {
          // Fall back to plain escaped code below.
        }

        const plainCode = token.escaped ? renderedCode : escapeHtml(renderedCode);
        const className = configuredLanguage
          ? `language-${escapeHtml(configuredLanguage)}`
          : undefined;

        return renderCodeBlock(plainCode, {
          classes: className,
          code: sourceCode,
          declaredLanguage,
          highlighted: false,
          language: configuredLanguage,
          renderHeader: options.renderHeader,
        });
      },
    },
  };
}
