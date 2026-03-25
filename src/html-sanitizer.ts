import xss from 'xss';
import type { IWhiteList, OnTagAttrHandler, SafeAttrValueHandler } from 'xss';

import type { HtmlSanitizeOptions, HtmlSanitizer } from './types.js';

const xssRuntime = xss as unknown as typeof import('xss');

const {
  FilterXSS,
  friendlyAttrValue,
  getDefaultWhiteList,
  safeAttrValue: defaultSafeAttrValue,
} = xssRuntime;

const GENERIC_SAFE_ATTR_RE = /^(class|role|aria-[a-z0-9_-]+|data-[a-z0-9_-]+)$/u;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/iu;
const MATHML_TAGS = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mfrac',
  'msup',
  'msub',
  'msubsup',
  'msqrt',
  'mroot',
  'mspace',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'mfenced',
  'mtable',
  'mtr',
  'mtd',
  'munder',
  'mover',
  'munderover',
  'mprescripts',
  'none',
] as const;

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function cloneAllowList(): IWhiteList {
  const allowList = getDefaultWhiteList();

  allowList.button = ['type', 'disabled', 'name', 'value'];
  allowList.aside = allowList.aside ?? [];
  allowList.article = allowList.article ?? [];
  allowList.section = allowList.section ?? [];
  allowList.header = allowList.header ?? [];
  allowList.footer = allowList.footer ?? [];
  allowList.span = [...(allowList.span ?? []), 'class'];
  allowList.div = [...(allowList.div ?? []), 'class', 'data-language', 'data-container-type'];
  allowList.pre = [...(allowList.pre ?? []), 'class'];
  allowList.code = [...(allowList.code ?? []), 'class'];

  for (const tag of MATHML_TAGS) {
    allowList[tag] = [];
  }

  allowList.math = ['xmlns', 'display', 'class'];
  allowList.annotation = ['encoding'];

  return allowList;
}

function isRelativeUrl(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('?') ||
    value.startsWith('//') ||
    !URL_SCHEME_RE.test(value)
  );
}

function isAllowedHref(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('http:') ||
    normalized.startsWith('https:') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:') ||
    isRelativeUrl(value)
  );
}

function isAllowedSrc(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.startsWith('http:') || normalized.startsWith('https:') || isRelativeUrl(value);
}

const safeAttrValue: SafeAttrValueHandler = (tag, name, value, cssFilter) => {
  const normalized = friendlyAttrValue(value).trim();
  const attrName = name.toLowerCase();

  if (attrName === 'href') {
    return isAllowedHref(normalized)
      ? defaultSafeAttrValue(tag, name, normalized, cssFilter)
      : '';
  }

  if (attrName === 'src') {
    return isAllowedSrc(normalized)
      ? defaultSafeAttrValue(tag, name, normalized, cssFilter)
      : '';
  }

  return defaultSafeAttrValue(tag, name, value, cssFilter);
};

const onTagAttr: OnTagAttrHandler = (tag, name, value, isWhiteAttr) => {
  if (isWhiteAttr) {
    return;
  }

  const attrName = name.toLowerCase();
  if (!GENERIC_SAFE_ATTR_RE.test(attrName)) {
    return;
  }

  return `${attrName}="${escapeAttributeValue(value)}"`;
};

export function createDefaultHtmlSanitizer(): HtmlSanitizer {
  const sanitizer = new FilterXSS({
    allowList: cloneAllowList(),
    safeAttrValue,
    onTagAttr,
  });

  return (html: string) => sanitizer.process(html);
}

export function createHtmlSanitizer(options: HtmlSanitizeOptions = {}): HtmlSanitizer {
  return options.sanitizer ?? createDefaultHtmlSanitizer();
}
