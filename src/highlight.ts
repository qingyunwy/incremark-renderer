import hljs from 'highlight.js';
import type { MarkedExtension, Tokens } from 'marked';

import type { CodeHighlightOptions } from './types.js';

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

  return `<div class="incremark-code-block-header"><span class="incremark-code-language">${escapeHtml(language)}</span></div>`;
}

function renderCodeBlock(html: string, options: { classes?: string; language?: string }): string {
  const classAttribute = options.classes ? ` class="${options.classes}"` : '';
  return `<div class="incremark-code-block"${buildWrapperAttributes(options.language)}>${renderLanguageBadge(options.language)}<pre><code${classAttribute}>${html}</code></pre></div>\n`;
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
        const code = normalizeCodeText(token.text);
        const explicitLanguage = normalizeLanguage(token.lang);
        const fallbackLanguage = explicitLanguage
          ? undefined
          : normalizeLanguage(options.defaultLanguage);
        const configuredLanguage = explicitLanguage ?? fallbackLanguage;

        try {
          if (highlightEnabled && configuredLanguage && hljs.getLanguage(configuredLanguage)) {
            const result = hljs.highlight(code, {
              language: configuredLanguage,
              ignoreIllegals: true,
            });
            return renderCodeBlock(result.value, {
              classes: buildCodeClassName(configuredLanguage),
              language: configuredLanguage,
            });
          }

          if (highlightEnabled && options.autoDetect) {
            const result = hljs.highlightAuto(code, getAutoDetectLanguages(options));
            if (result.language) {
              return renderCodeBlock(result.value, {
                classes: buildCodeClassName(result.language),
                language: result.language,
              });
            }
          }
        } catch {
          // Fall back to plain escaped code below.
        }

        const plainCode = token.escaped ? code : escapeHtml(code);
        const className = configuredLanguage
          ? `language-${escapeHtml(configuredLanguage)}`
          : undefined;

        return renderCodeBlock(plainCode, {
          classes: className,
          language: configuredLanguage,
        });
      },
    },
  };
}
