"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DefaultBlockRenderer: () => DefaultBlockRenderer,
  IncrementalDomRenderer: () => IncrementalDomRenderer,
  MarkdownTypewriter: () => MarkdownTypewriter,
  StreamMarkdownRenderer: () => StreamMarkdownRenderer,
  StreamingMarkdownTypewriter: () => StreamingMarkdownTypewriter,
  TypewriterCursorController: () => TypewriterCursorController,
  createContainerExtension: () => createContainerExtension,
  createDefaultHtmlSanitizer: () => createDefaultHtmlSanitizer,
  createHighlightExtension: () => createHighlightExtension,
  createHtmlSanitizer: () => createHtmlSanitizer,
  createMathExtension: () => createMathExtension,
  diffAst: () => diffAst,
  digestTokens: () => digestTokens,
  extractStableBlocks: () => extractStableBlocks,
  renderMarkdown: () => renderMarkdown,
  renderMarkdownToString: () => renderMarkdownToString,
  wrapBlockHtml: () => wrapBlockHtml
});
module.exports = __toCommonJS(index_exports);

// src/container-syntax.ts
var FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
var CONTAINER_PATTERN = /^ {0,3}(:{3,})([^\n]*)$/u;
function stripLineEnding(line) {
  return line.endsWith("\n") ? line.slice(0, -1) : line;
}
function getFenceStart(line) {
  const match = stripLineEnding(line).match(FENCE_PATTERN);
  const fence = match?.[1];
  if (!fence) {
    return null;
  }
  return {
    marker: fence[0] ?? "`",
    size: fence.length
  };
}
function isFenceEnd(line, state) {
  const trimmed = stripLineEnding(line);
  const pattern = new RegExp(`^ {0,3}${state.marker}{${state.size},}\\s*$`, "u");
  return pattern.test(trimmed);
}
function getContainerOpen(line) {
  const match = stripLineEnding(line).match(CONTAINER_PATTERN);
  const marker = match?.[1];
  const rawInfo = match?.[2]?.trim();
  if (!marker || !rawInfo) {
    return null;
  }
  const [type, ...titleParts] = rawInfo.split(/\s+/u);
  if (!type) {
    return null;
  }
  const title = titleParts.join(" ").trim() || void 0;
  return {
    info: rawInfo,
    type,
    title,
    size: marker.length
  };
}
function isContainerClose(line, size) {
  const pattern = new RegExp(`^ {0,3}:{${size},}\\s*$`, "u");
  return pattern.test(stripLineEnding(line));
}

// src/block-boundary.ts
var SINGLE_LINE_BLOCK_PATTERN = /^(#{1,6}\s+.+| {0,3}([-*_])(?:\s*\2){2,}\s*)$/;
var SETEXT_UNDERLINE_PATTERN = /^ {0,3}(=+|-+)\s*$/;
function getCompletedLines(input) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "\n") {
      lines.push(input.slice(start, index + 1));
      start = index + 1;
    }
  }
  return {
    lines,
    rest: input.slice(start)
  };
}
function isBlankLine(line) {
  return /^\s*$/.test(stripLineEnding(line));
}
function classifyBufferedBlock(lines) {
  const firstLine = lines[0];
  if (lines.length === 1 && firstLine && SINGLE_LINE_BLOCK_PATTERN.test(stripLineEnding(firstLine))) {
    return "single";
  }
  const secondLine = lines[1];
  if (lines.length === 2 && secondLine && SETEXT_UNDERLINE_PATTERN.test(stripLineEnding(secondLine))) {
    return "setext";
  }
  return "buffered";
}
function flushCurrentBlock(target, lines) {
  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || !isBlankLine(lastLine)) {
      break;
    }
    lines.pop();
  }
  if (lines.length > 0) {
    target.push(lines.join(""));
  }
}
function extractStableBlocks(input, finalize = false) {
  const { lines, rest } = getCompletedLines(input);
  const stableBlocks = [];
  const current = [];
  let fenceState = null;
  const containerStack = [];
  for (const line of lines) {
    if (fenceState) {
      current.push(line);
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
        if (containerStack.length === 0) {
          flushCurrentBlock(stableBlocks, current);
          current.length = 0;
        }
      }
      continue;
    }
    if (containerStack.length > 0) {
      current.push(line);
      const start = getFenceStart(line);
      if (start) {
        fenceState = start;
        continue;
      }
      const nestedOpen = getContainerOpen(line);
      if (nestedOpen) {
        containerStack.push(nestedOpen.size);
        continue;
      }
      const currentSize = containerStack[containerStack.length - 1];
      if (currentSize && isContainerClose(line, currentSize)) {
        containerStack.pop();
        if (containerStack.length === 0) {
          flushCurrentBlock(stableBlocks, current);
          current.length = 0;
        }
      }
      continue;
    }
    if (current.length === 0) {
      if (isBlankLine(line)) {
        continue;
      }
      const start = getFenceStart(line);
      if (start) {
        current.push(line);
        fenceState = start;
        continue;
      }
      const containerOpen = getContainerOpen(line);
      if (containerOpen) {
        current.push(line);
        containerStack.push(containerOpen.size);
        continue;
      }
      current.push(line);
      const type = classifyBufferedBlock(current);
      if (type === "single") {
        flushCurrentBlock(stableBlocks, current);
        current.length = 0;
      }
      continue;
    }
    current.push(line);
    if (isBlankLine(line)) {
      flushCurrentBlock(stableBlocks, current);
      current.length = 0;
      continue;
    }
    if (classifyBufferedBlock(current) === "setext") {
      flushCurrentBlock(stableBlocks, current);
      current.length = 0;
    }
  }
  if (finalize) {
    if (rest.length > 0) {
      current.push(rest);
    }
    flushCurrentBlock(stableBlocks, current);
    return { stableBlocks, tail: "" };
  }
  return {
    stableBlocks,
    tail: current.join("") + rest
  };
}

// src/ast-diff.ts
function getChildren(token) {
  const nested = [];
  if (Array.isArray(token.tokens)) {
    nested.push(...token.tokens);
  }
  if (Array.isArray(token.items)) {
    for (const item of token.items) {
      if (Array.isArray(item.tokens)) {
        nested.push(...item.tokens);
      }
      if (Array.isArray(item.items)) {
        nested.push(...item.items);
      }
    }
  }
  return nested;
}
function digestValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(digestValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => key !== "tokens").sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${key}:${digestValue(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
function digestTokens(tokens) {
  return tokens.map((token) => {
    const base = digestValue(token);
    const children = getChildren(token);
    return children.length > 0 ? `${base}<${digestTokens(children)}>` : base;
  }).join("|");
}
function tokenType(token) {
  if (!token) {
    return void 0;
  }
  return typeof token.type === "string" ? token.type : "unknown";
}
function diffTokenLists(previous, next, basePath, patches) {
  const length = Math.max(previous.length, next.length);
  for (let index = 0; index < length; index += 1) {
    const prevToken = previous[index];
    const nextToken = next[index];
    const path = `${basePath}/${index}`;
    if (!prevToken && nextToken) {
      patches.push({ path, kind: "add", nextType: tokenType(nextToken) });
      continue;
    }
    if (prevToken && !nextToken) {
      patches.push({ path, kind: "remove", prevType: tokenType(prevToken) });
      continue;
    }
    if (!prevToken || !nextToken) {
      continue;
    }
    const prevDigest = digestValue(prevToken);
    const nextDigest = digestValue(nextToken);
    if (prevDigest !== nextDigest) {
      patches.push({
        path,
        kind: "replace",
        prevType: tokenType(prevToken),
        nextType: tokenType(nextToken)
      });
      continue;
    }
    diffTokenLists(
      getChildren(prevToken),
      getChildren(nextToken),
      `${path}/children`,
      patches
    );
  }
}
function diffAst(previous, next) {
  const patches = [];
  diffTokenLists(previous, next, "root", patches);
  return patches;
}

// src/container.ts
var CONTAINER_START_RE = /(^|\n) {0,3}:{3,}(?:(?=[^\s:\n])|[ \t]+(?=\S))/u;
var HTML_ESCAPE_RE = /[&<>"']/g;
var HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(value) {
  return value.replace(HTML_ESCAPE_RE, (character) => HTML_ESCAPES[character] ?? character);
}
function sanitizeClassNameSegment(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "-");
  return normalized.replace(/^-+|-+$/gu, "") || "default";
}
function readLine(src, start) {
  const newline = src.indexOf("\n", start);
  if (newline === -1) {
    return {
      line: src.slice(start),
      next: src.length
    };
  }
  return {
    line: src.slice(start, newline + 1),
    next: newline + 1
  };
}
function buildDefaultClassName(type) {
  return `incremark-container incremark-container-${sanitizeClassNameSegment(type)}`;
}
function renderDefaultContainer(context) {
  const titleHtml = context.title ? `<div class="incremark-container-title">${escapeHtml(context.title)}</div>` : "";
  return `<div class="${context.defaultClassName}" data-container-type="${escapeHtml(context.type)}">${titleHtml}<div class="incremark-container-content">${context.innerHtml}</div></div>
`;
}
function scanContainer(src) {
  const firstLine = readLine(src, 0);
  const opening = getContainerOpen(firstLine.line);
  if (!opening) {
    return null;
  }
  const containerStack = [opening.size];
  const contentStart = firstLine.next;
  let cursor = firstLine.next;
  let fenceState = null;
  while (cursor < src.length) {
    const { line, next } = readLine(src, cursor);
    if (fenceState) {
      if (isFenceEnd(line, fenceState)) {
        fenceState = null;
      }
      cursor = next;
      continue;
    }
    const fence = getFenceStart(line);
    if (fence) {
      fenceState = fence;
      cursor = next;
      continue;
    }
    const nestedOpen = getContainerOpen(line);
    if (nestedOpen) {
      containerStack.push(nestedOpen.size);
      cursor = next;
      continue;
    }
    const currentSize = containerStack[containerStack.length - 1];
    if (currentSize && isContainerClose(line, currentSize)) {
      containerStack.pop();
      if (containerStack.length === 0) {
        return {
          type: "customContainer",
          raw: src.slice(0, next),
          text: src.slice(contentStart, cursor),
          containerType: opening.type,
          info: opening.info,
          title: opening.title
        };
      }
    }
    cursor = next;
  }
  return {
    type: "customContainer",
    raw: src,
    text: src.slice(contentStart),
    containerType: opening.type,
    info: opening.info,
    title: opening.title
  };
}
function createContainerExtension(options = {}) {
  return {
    extensions: [
      {
        name: "customContainer",
        level: "block",
        start(src) {
          const match = src.match(CONTAINER_START_RE);
          if (!match) {
            return;
          }
          return match.index === void 0 ? void 0 : match.index + (match[1]?.length ?? 0);
        },
        tokenizer(src) {
          const token = scanContainer(src);
          if (!token) {
            return;
          }
          return {
            ...token,
            tokens: this.lexer.blockTokens(token.text, [])
          };
        },
        renderer(token) {
          const container = token;
          const innerHtml = this.parser.parse(container.tokens);
          const context = {
            type: container.containerType,
            info: container.info,
            title: container.title,
            raw: container.raw,
            text: container.text,
            innerHtml,
            defaultClassName: buildDefaultClassName(container.containerType)
          };
          const customHtml = options.render?.(context);
          return customHtml === null || customHtml === void 0 ? renderDefaultContainer(context) : customHtml;
        },
        childTokens: ["tokens"]
      }
    ]
  };
}

// src/html-sanitizer.ts
var import_xss = __toESM(require("xss"), 1);
var xssRuntime = import_xss.default;
var {
  FilterXSS,
  friendlyAttrValue,
  getDefaultWhiteList,
  safeAttrValue: defaultSafeAttrValue
} = xssRuntime;
var GENERIC_SAFE_ATTR_RE = /^(class|role|aria-[a-z0-9_-]+|data-[a-z0-9_-]+)$/u;
var URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/iu;
var MATHML_TAGS = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "mfrac",
  "msup",
  "msub",
  "msubsup",
  "msqrt",
  "mroot",
  "mspace",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "mfenced",
  "mtable",
  "mtr",
  "mtd",
  "munder",
  "mover",
  "munderover",
  "mprescripts",
  "none"
];
function escapeAttributeValue(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function cloneAllowList() {
  const allowList = getDefaultWhiteList();
  allowList.button = ["type", "disabled", "name", "value"];
  allowList.aside = allowList.aside ?? [];
  allowList.article = allowList.article ?? [];
  allowList.section = allowList.section ?? [];
  allowList.header = allowList.header ?? [];
  allowList.footer = allowList.footer ?? [];
  allowList.span = [...allowList.span ?? [], "class"];
  allowList.div = [...allowList.div ?? [], "class", "data-language", "data-container-type"];
  allowList.pre = [...allowList.pre ?? [], "class"];
  allowList.code = [...allowList.code ?? [], "class"];
  for (const tag of MATHML_TAGS) {
    allowList[tag] = [];
  }
  allowList.math = ["xmlns", "display", "class"];
  allowList.annotation = ["encoding"];
  return allowList;
}
function isRelativeUrl(value) {
  return value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("?") || value.startsWith("//") || !URL_SCHEME_RE.test(value);
}
function isAllowedHref(value) {
  const normalized = value.toLowerCase();
  return normalized.startsWith("http:") || normalized.startsWith("https:") || normalized.startsWith("mailto:") || normalized.startsWith("tel:") || isRelativeUrl(value);
}
function isAllowedSrc(value) {
  const normalized = value.toLowerCase();
  return normalized.startsWith("http:") || normalized.startsWith("https:") || isRelativeUrl(value);
}
var safeAttrValue = (tag, name, value, cssFilter) => {
  const normalized = friendlyAttrValue(value).trim();
  const attrName = name.toLowerCase();
  if (attrName === "href") {
    return isAllowedHref(normalized) ? defaultSafeAttrValue(tag, name, normalized, cssFilter) : "";
  }
  if (attrName === "src") {
    return isAllowedSrc(normalized) ? defaultSafeAttrValue(tag, name, normalized, cssFilter) : "";
  }
  return defaultSafeAttrValue(tag, name, value, cssFilter);
};
var onTagAttr = (tag, name, value, isWhiteAttr) => {
  if (isWhiteAttr) {
    return;
  }
  const attrName = name.toLowerCase();
  if (!GENERIC_SAFE_ATTR_RE.test(attrName)) {
    return;
  }
  return `${attrName}="${escapeAttributeValue(value)}"`;
};
function createDefaultHtmlSanitizer() {
  const sanitizer = new FilterXSS({
    allowList: cloneAllowList(),
    safeAttrValue,
    onTagAttr
  });
  return (html) => sanitizer.process(html);
}
function createHtmlSanitizer(options = {}) {
  return options.sanitizer ?? createDefaultHtmlSanitizer();
}

// src/renderers.ts
var DefaultBlockRenderer = class {
  marked;
  constructor(marked) {
    this.marked = marked;
  }
  renderBlock(block) {
    return this.marked.parser(block.tokens);
  }
};
function wrapBlockHtml(block, innerHtml) {
  return `<div data-incremark-block="${block.key}" data-stable="${block.stable}">${innerHtml}</div>`;
}

// src/stream-markdown.ts
var import_marked = require("marked");

// src/highlight.ts
var import_highlight = __toESM(require("highlight.js"), 1);
var TRAILING_NEWLINE_RE = /\n$/u;
var INFO_LANGUAGE_RE = /^\S+/u;
var HTML_ESCAPE_RE2 = /[&<>"']/g;
var HTML_ESCAPES2 = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml2(value) {
  return value.replace(HTML_ESCAPE_RE2, (character) => HTML_ESCAPES2[character] ?? character);
}
function normalizeCodeText(value) {
  return `${value.replace(TRAILING_NEWLINE_RE, "")}
`;
}
function normalizeLanguage(value) {
  return value?.trim().match(INFO_LANGUAGE_RE)?.[0];
}
function buildCodeClassName(language) {
  const classes = ["hljs"];
  if (language) {
    classes.push(`language-${language}`);
  }
  return classes.map((value) => escapeHtml2(value)).join(" ");
}
function buildWrapperAttributes(language) {
  if (!language) {
    return "";
  }
  return ` data-language="${escapeHtml2(language)}"`;
}
function renderLanguageBadge(language) {
  if (!language) {
    return "";
  }
  return `<span class="incremark-code-language">${escapeHtml2(language)}</span>`;
}
function renderCodeBlockHeader(options) {
  const context = {
    code: options.code,
    language: options.language,
    declaredLanguage: options.declaredLanguage,
    highlighted: options.highlighted,
    defaultHeaderContent: renderLanguageBadge(options.language)
  };
  const customHeader = options.renderHeader?.(context);
  const headerContent = customHeader === void 0 ? context.defaultHeaderContent : customHeader;
  if (!headerContent) {
    return {
      defaultHeaderContent: context.defaultHeaderContent,
      headerHtml: ""
    };
  }
  return {
    defaultHeaderContent: context.defaultHeaderContent,
    headerHtml: `<div class="incremark-code-block-header">${headerContent}</div>`
  };
}
function normalizeRendererMap(renderers) {
  if (!renderers) {
    return void 0;
  }
  return Object.fromEntries(
    Object.entries(renderers).map(([language, renderer]) => [normalizeLanguage(language), renderer]).filter((entry) => Boolean(entry[0] && entry[1]))
  );
}
function resolveLanguageRenderer(renderers, declaredLanguage, language) {
  if (!renderers) {
    return void 0;
  }
  const declared = declaredLanguage ? renderers[declaredLanguage] : void 0;
  if (declared) {
    return declared;
  }
  return language ? renderers[language] : void 0;
}
function renderCodeBlock(options) {
  const header = renderCodeBlockHeader(options);
  const classAttribute = options.codeClassName ? ` class="${options.codeClassName}"` : "";
  const defaultHtml = `<div class="incremark-code-block"${buildWrapperAttributes(options.language)}>${header.headerHtml}<pre><code${classAttribute}>${options.bodyHtml}</code></pre></div>
`;
  const context = {
    code: options.code,
    language: options.language,
    declaredLanguage: options.declaredLanguage,
    highlighted: options.highlighted,
    defaultHeaderContent: header.defaultHeaderContent,
    headerHtml: header.headerHtml,
    bodyHtml: options.bodyHtml,
    codeClassName: options.codeClassName,
    defaultHtml
  };
  const languageRenderer = resolveLanguageRenderer(
    options.languageRenderers,
    options.declaredLanguage,
    options.language
  );
  const languageHtml = languageRenderer?.(context);
  if (languageHtml !== void 0 && languageHtml !== null) {
    return languageHtml;
  }
  const customHtml = options.renderBlock?.(context);
  if (customHtml !== void 0 && customHtml !== null) {
    return customHtml;
  }
  return defaultHtml;
}
function getAutoDetectLanguages(options) {
  const languages = options.languages?.map((language) => normalizeLanguage(language)).filter((language) => Boolean(language && import_highlight.default.getLanguage(language)));
  return languages?.length ? languages : void 0;
}
function createHighlightExtension(options = {}, runtime = {}) {
  const highlightEnabled = runtime.highlightEnabled !== false;
  const languageRenderers = normalizeRendererMap(options.languageRenderers);
  return {
    renderer: {
      code(token) {
        const sourceCode = token.text;
        const renderedCode = normalizeCodeText(sourceCode);
        const declaredLanguage = normalizeLanguage(token.lang);
        const fallbackLanguage = declaredLanguage ? void 0 : normalizeLanguage(options.defaultLanguage);
        const configuredLanguage = declaredLanguage ?? fallbackLanguage;
        try {
          if (highlightEnabled && configuredLanguage && import_highlight.default.getLanguage(configuredLanguage)) {
            const result = import_highlight.default.highlight(renderedCode, {
              language: configuredLanguage,
              ignoreIllegals: true
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
              renderHeader: options.renderHeader
            });
          }
          if (highlightEnabled && options.autoDetect) {
            const result = import_highlight.default.highlightAuto(renderedCode, getAutoDetectLanguages(options));
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
                renderHeader: options.renderHeader
              });
            }
          }
        } catch {
        }
        const plainCode = token.escaped ? renderedCode : escapeHtml2(renderedCode);
        const codeClassName = configuredLanguage ? `language-${escapeHtml2(configuredLanguage)}` : void 0;
        return renderCodeBlock({
          bodyHtml: plainCode,
          code: sourceCode,
          codeClassName,
          declaredLanguage,
          highlighted: false,
          language: configuredLanguage,
          languageRenderers,
          renderBlock: options.renderBlock,
          renderHeader: options.renderHeader
        });
      }
    }
  };
}

// src/math.ts
var import_katex = __toESM(require("katex"), 1);
var BLOCK_DOLLAR = "$$";
var BLOCK_BRACKET_OPEN = "\\[";
var BLOCK_BRACKET_CLOSE = "\\]";
var INLINE_DOLLAR = "$";
var INLINE_PAREN_OPEN = "\\(";
var INLINE_PAREN_CLOSE = "\\)";
function escapeHtml3(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function readDelimited(src, open, close, allowNewline) {
  if (!src.startsWith(open)) {
    return null;
  }
  let index = open.length;
  while (index < src.length) {
    if (src.startsWith(close, index)) {
      const text = src.slice(open.length, index);
      if (text.trim().length === 0) {
        return null;
      }
      return {
        raw: src.slice(0, index + close.length),
        text
      };
    }
    if (!allowNewline && src[index] === "\n") {
      return null;
    }
    if (src[index] === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}
function renderMath(token, options) {
  try {
    const markup = import_katex.default.renderToString(token.text, {
      ...options?.katex ?? {},
      displayMode: token.displayMode,
      output: options?.katex?.output ?? "mathml",
      throwOnError: options?.katex?.throwOnError ?? true
    });
    if (token.displayMode) {
      return `<div class="incremark-math incremark-math-block">${markup}</div>`;
    }
    return `<span class="incremark-math incremark-math-inline">${markup}</span>`;
  } catch (error) {
    return escapeHtml3(token.raw);
  }
}
function createMathExtension(options) {
  return {
    extensions: [
      {
        name: "mathBlock",
        level: "block",
        start(src) {
          const dollar = src.indexOf(BLOCK_DOLLAR);
          const bracket = src.indexOf(BLOCK_BRACKET_OPEN);
          const candidates = [dollar, bracket].filter((value) => value >= 0);
          if (candidates.length === 0) {
            return;
          }
          return Math.min(...candidates);
        },
        tokenizer(src) {
          const dollar = readDelimited(src, BLOCK_DOLLAR, BLOCK_DOLLAR, true);
          if (dollar) {
            return {
              type: "mathBlock",
              raw: dollar.raw,
              text: dollar.text.trim(),
              displayMode: true
            };
          }
          const bracket = readDelimited(src, BLOCK_BRACKET_OPEN, BLOCK_BRACKET_CLOSE, true);
          if (bracket) {
            return {
              type: "mathBlock",
              raw: bracket.raw,
              text: bracket.text.trim(),
              displayMode: true
            };
          }
          return;
        },
        renderer(token) {
          return renderMath(token, options);
        }
      },
      {
        name: "mathInline",
        level: "inline",
        start(src) {
          const dollar = src.indexOf(INLINE_DOLLAR);
          const paren = src.indexOf(INLINE_PAREN_OPEN);
          const candidates = [dollar, paren].filter((value) => value >= 0);
          if (candidates.length === 0) {
            return;
          }
          return Math.min(...candidates);
        },
        tokenizer(src) {
          if (src.startsWith(BLOCK_DOLLAR)) {
            return;
          }
          const dollar = readDelimited(src, INLINE_DOLLAR, INLINE_DOLLAR, false);
          if (dollar) {
            return {
              type: "mathInline",
              raw: dollar.raw,
              text: dollar.text.trim(),
              displayMode: false
            };
          }
          const paren = readDelimited(src, INLINE_PAREN_OPEN, INLINE_PAREN_CLOSE, false);
          if (paren) {
            return {
              type: "mathInline",
              raw: paren.raw,
              text: paren.text.trim(),
              displayMode: false
            };
          }
          return;
        },
        renderer(token) {
          return renderMath(token, options);
        }
      }
    ]
  };
}

// src/stream-markdown.ts
function makeSnapshot(blocks, sourceLength) {
  return {
    blocks,
    stableCount: blocks.filter((block) => block.stable).length,
    sourceLength
  };
}
function cloneBlocks(blocks) {
  return blocks.map((block) => ({ ...block }));
}
var StreamMarkdownRenderer = class {
  marked;
  mathEnabled;
  renderer;
  sanitizeHtml;
  plugins;
  stableBlocks = [];
  source = "";
  tail = "";
  sequence = 0;
  constructor(options = {}) {
    this.mathEnabled = options.math !== false;
    const mathOptions = options.math === false ? void 0 : options.math;
    const containerOptions = options.container === false ? void 0 : options.container ?? {};
    const highlightOptions = options.highlight === false ? {} : options.highlight ?? {};
    const extensions = [
      ...this.mathEnabled ? [createMathExtension(mathOptions)] : [],
      ...containerOptions ? [createContainerExtension(containerOptions)] : [],
      createHighlightExtension(highlightOptions, {
        highlightEnabled: options.highlight !== false
      })
    ];
    this.marked = new import_marked.Marked(...extensions);
    if (options.marked) {
      this.marked.setOptions(options.marked);
    }
    this.renderer = options.renderer ?? new DefaultBlockRenderer(this.marked);
    this.sanitizeHtml = options.sanitizeHtml === false ? null : createHtmlSanitizer(options.sanitizeHtml ?? {});
    this.plugins = options.plugins ?? [];
  }
  append(chunk) {
    if (!chunk) {
      return [];
    }
    this.source += chunk;
    return this.reconcile(chunk, false);
  }
  setMarkdown(markdown) {
    const previousBlocks = this.computeVisibleBlocks();
    this.source = markdown;
    this.tail = "";
    this.sequence = 0;
    this.stableBlocks.length = 0;
    const extraction = extractStableBlocks(markdown, true);
    for (const text of extraction.stableBlocks) {
      this.stableBlocks.push(this.createBlock(text, true));
    }
    const nextBlocks = this.computeVisibleBlocks();
    const patches = this.diffBlocks(previousBlocks, nextBlocks);
    const snapshot = makeSnapshot(cloneBlocks(nextBlocks), this.source.length);
    for (const plugin of this.plugins) {
      plugin.onPatchesComputed?.(patches, snapshot);
    }
    return patches;
  }
  finalize() {
    return this.reconcile("", true);
  }
  reset() {
    this.source = "";
    this.tail = "";
    this.sequence = 0;
    this.stableBlocks.length = 0;
  }
  getSnapshot() {
    return makeSnapshot(this.getBlocks(), this.source.length);
  }
  getBlocks() {
    return cloneBlocks(this.computeVisibleBlocks());
  }
  renderToString() {
    return this.computeVisibleBlocks().map((block) => block.html).join("");
  }
  // `reconcile` is the core streaming loop:
  // 1. re-scan only the previous tail plus the incoming chunk
  // 2. freeze any newly stable blocks
  // 3. keep the remaining tail mutable
  // 4. diff previous vs next visible blocks to emit minimal render patches
  reconcile(incomingChunk, finalize) {
    const previousBlocks = this.computeVisibleBlocks();
    const extraction = extractStableBlocks(this.tail + incomingChunk, finalize);
    this.tail = extraction.tail;
    for (const text of extraction.stableBlocks) {
      this.stableBlocks.push(this.createBlock(text, true));
    }
    const nextBlocks = this.computeVisibleBlocks();
    const patches = this.diffBlocks(previousBlocks, nextBlocks);
    const snapshot = makeSnapshot(cloneBlocks(nextBlocks), this.source.length);
    for (const plugin of this.plugins) {
      plugin.onPatchesComputed?.(patches, snapshot);
    }
    return patches;
  }
  computeVisibleBlocks() {
    const blocks = cloneBlocks(this.stableBlocks);
    if (this.tail.length > 0) {
      blocks.push(this.createBlock(this.tail, false, "tail"));
    }
    return blocks;
  }
  createBlock(text, stable, explicitKey) {
    const tokens = this.marked.lexer(text);
    const key = explicitKey ?? `block-${this.sequence += 1}`;
    const draft = {
      key,
      text,
      tokens,
      digest: digestTokens(tokens),
      html: "",
      stable
    };
    let nextBlock = {
      ...draft,
      html: this.renderer.renderBlock(draft)
    };
    for (const plugin of this.plugins) {
      nextBlock = plugin.onBlockParsed?.(nextBlock) ?? nextBlock;
    }
    if (this.sanitizeHtml) {
      nextBlock = {
        ...nextBlock,
        html: this.sanitizeHtml(nextBlock.html)
      };
    }
    return nextBlock;
  }
  diffBlocks(previous, next) {
    const patches = [];
    const max = Math.max(previous.length, next.length);
    for (let index = 0; index < max; index += 1) {
      const prevBlock = previous[index];
      const nextBlock = next[index];
      if (!prevBlock && nextBlock) {
        patches.push({ type: "insert", key: nextBlock.key, index, block: nextBlock });
        continue;
      }
      if (prevBlock && !nextBlock) {
        patches.push({ type: "remove", key: prevBlock.key, index, previousBlock: prevBlock });
        continue;
      }
      if (!prevBlock || !nextBlock) {
        continue;
      }
      if (prevBlock.key !== nextBlock.key) {
        patches.push({
          type: "replace",
          key: nextBlock.key,
          index,
          previousBlock: prevBlock,
          block: nextBlock,
          astPatches: diffAst(prevBlock.tokens, nextBlock.tokens)
        });
        continue;
      }
      if (prevBlock.digest !== nextBlock.digest || prevBlock.html !== nextBlock.html) {
        patches.push({
          type: "replace",
          key: nextBlock.key,
          index,
          previousBlock: prevBlock,
          block: nextBlock,
          astPatches: diffAst(prevBlock.tokens, nextBlock.tokens)
        });
      }
    }
    return patches;
  }
};

// src/dom-renderer.ts
function syncAttributes(current, next) {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }
  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
}
function collectInPlaceSync(current, next, attributePairs, textPatches) {
  if (current.nodeType !== next.nodeType) {
    return false;
  }
  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    textPatches.push({
      current,
      nextValue: next.textContent ?? ""
    });
    return true;
  }
  if (!(current instanceof Element) || !(next instanceof Element)) {
    return false;
  }
  if (current.tagName !== next.tagName || current.childNodes.length !== next.childNodes.length) {
    return false;
  }
  attributePairs.push({ current, next });
  for (let index = 0; index < current.childNodes.length; index += 1) {
    if (!collectInPlaceSync(
      current.childNodes[index],
      next.childNodes[index],
      attributePairs,
      textPatches
    )) {
      return false;
    }
  }
  return true;
}
var IncrementalDomRenderer = class {
  engine;
  root;
  constructor(root, options = {}) {
    this.root = root;
    this.engine = new StreamMarkdownRenderer(options);
  }
  append(chunk) {
    const patches = this.engine.append(chunk);
    this.applyPatches(patches);
    return patches;
  }
  setMarkdown(markdown) {
    const patches = this.engine.setMarkdown(markdown);
    this.applyPatches(patches);
    return patches;
  }
  finalize() {
    const patches = this.engine.finalize();
    this.applyPatches(patches);
    return patches;
  }
  reset() {
    this.engine.reset();
    this.root.innerHTML = "";
  }
  getBlocks() {
    return this.engine.getBlocks();
  }
  renderToString() {
    return this.engine.renderToString();
  }
  // DOM application stays block-granular: each patch maps to one wrapper element,
  // which keeps unchanged blocks mounted and avoids whole-container repaint work.
  applyPatches(patches) {
    for (const patch of patches) {
      if (patch.type === "remove" && patch.previousBlock) {
        this.getBlockNode(patch.previousBlock.key)?.remove();
        continue;
      }
      if (!patch.block) {
        continue;
      }
      const node = this.createBlockElement(patch.block);
      const reference = this.getBlockChildren()[patch.index] ?? null;
      if (patch.type === "insert") {
        this.root.insertBefore(node, reference);
        continue;
      }
      if (patch.type === "replace") {
        const existing = patch.previousBlock ? this.getBlockNode(patch.previousBlock.key) : this.getBlockNode(patch.key);
        if (!existing) {
          continue;
        }
        if (!this.trySyncBlockInPlace(existing, node)) {
          existing.replaceWith(node);
        }
      }
    }
  }
  createBlockElement(block) {
    const template = document.createElement("template");
    template.innerHTML = wrapBlockHtml(block, block.html);
    return template.content.firstElementChild;
  }
  getBlockNode(key) {
    return this.root.querySelector(`[data-incremark-block="${key}"]`);
  }
  getBlockChildren() {
    return Array.from(this.root.children).filter(
      (child) => child instanceof HTMLElement && child.hasAttribute("data-incremark-block")
    );
  }
  trySyncBlockInPlace(existing, next) {
    const attributePairs = [];
    const textPatches = [];
    if (!collectInPlaceSync(existing, next, attributePairs, textPatches)) {
      return false;
    }
    for (const pair of attributePairs) {
      syncAttributes(pair.current, pair.next);
    }
    for (const patch of textPatches) {
      if (patch.current.data !== patch.nextValue) {
        patch.current.data = patch.nextValue;
      }
    }
    return true;
  }
};

// src/full-render.ts
function renderMarkdown(markdown, options = {}) {
  const renderer = new StreamMarkdownRenderer(options);
  renderer.setMarkdown(markdown);
  return {
    html: renderer.renderToString(),
    blocks: renderer.getBlocks(),
    snapshot: renderer.getSnapshot()
  };
}
function renderMarkdownToString(markdown, options = {}) {
  return renderMarkdown(markdown, options).html;
}

// src/typewriter-cursor.ts
function getLastBlock(root) {
  const blocks = root.querySelectorAll("[data-incremark-block]");
  return blocks.length > 0 ? blocks.item(blocks.length - 1) : null;
}
function getCursorLineHeight(element) {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  if (Number.isFinite(lineHeight)) {
    return lineHeight;
  }
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.4 : 24;
}
function getCursorFontSize(element) {
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(fontSize) ? fontSize : 16;
}
function needsMarkerMeasurement(node) {
  if (node.nodeType !== Node.TEXT_NODE) {
    return true;
  }
  const text = node.textContent ?? "";
  return text.endsWith("\n");
}
function measureRangeWithMarker(range) {
  const marker = document.createElement("span");
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = "\u200B";
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "1em";
  marker.style.overflow = "hidden";
  marker.style.opacity = "0";
  marker.style.pointerEvents = "none";
  marker.style.userSelect = "none";
  marker.style.verticalAlign = "baseline";
  range.insertNode(marker);
  const normalizeTarget = marker.parentNode;
  const rect = marker.getBoundingClientRect();
  marker.remove();
  normalizeTarget?.normalize();
  return rect.width || rect.height ? rect : null;
}
function getCaretContextElement(lastNode, lastBlock) {
  if (lastNode instanceof Text) {
    return lastNode.parentElement ?? lastBlock;
  }
  return lastNode instanceof HTMLElement ? lastNode : lastBlock;
}
function findCaretMetrics(root) {
  const lastBlock = getLastBlock(root);
  if (!lastBlock) {
    return null;
  }
  const walker = document.createTreeWalker(
    lastBlock,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node instanceof HTMLElement && node.classList.contains("incremark-typewriter-cursor")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent?.trim().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        return node instanceof HTMLElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );
  let current = walker.nextNode();
  let lastNode = null;
  while (current) {
    lastNode = current;
    current = walker.nextNode();
  }
  if (!lastNode) {
    return null;
  }
  const lineHeight = getCursorLineHeight(getCaretContextElement(lastNode, lastBlock));
  const fontSize = getCursorFontSize(getCaretContextElement(lastNode, lastBlock));
  const range = document.createRange();
  if (lastNode.nodeType === Node.TEXT_NODE) {
    const text = lastNode.textContent ?? "";
    range.setStart(lastNode, text.length);
    range.setEnd(lastNode, text.length);
  } else {
    range.selectNodeContents(lastNode);
    range.collapse(false);
  }
  const rects = range.getClientRects();
  const lastRect = rects.length > 0 ? rects.item(rects.length - 1) : null;
  if (lastRect && !needsMarkerMeasurement(lastNode)) {
    return { rect: lastRect, lineHeight, fontSize };
  }
  const rect = measureRangeWithMarker(range) ?? lastRect ?? lastBlock.getBoundingClientRect();
  return { rect, lineHeight, fontSize };
}
var TypewriterCursorController = class {
  root;
  cursor;
  autoScroll;
  frame = null;
  visible = false;
  constructor(root, options = {}) {
    this.root = root;
    this.autoScroll = options.autoScroll ?? true;
    this.cursor = document.createElement("span");
    this.cursor.className = options.className ?? "incremark-typewriter-cursor";
    this.cursor.setAttribute("aria-hidden", "true");
    if (getComputedStyle(this.root).position === "static") {
      this.root.style.position = "relative";
    }
    this.root.append(this.cursor);
    this.hide();
    window.addEventListener("resize", this.handleViewportChange);
    window.addEventListener("scroll", this.handleViewportChange, true);
  }
  show() {
    this.visible = true;
    this.cursor.hidden = false;
    this.update();
  }
  hide() {
    this.visible = false;
    this.cursor.hidden = true;
  }
  update() {
    if (!this.visible) {
      return;
    }
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
    }
    this.frame = requestAnimationFrame(() => {
      const metrics = findCaretMetrics(this.root);
      const rootRect = this.root.getBoundingClientRect();
      const rect = metrics?.rect ?? null;
      const lineHeight = metrics?.lineHeight ?? 24;
      const fontSize = metrics?.fontSize ?? 16;
      const rectHeight = rect?.height ?? fontSize;
      const height = Math.max(18, Math.min(lineHeight, Math.max(fontSize, rectHeight * 0.92)));
      const top = rect ? rect.top - rootRect.top + this.root.scrollTop + (rectHeight - height) / 2 : this.root.scrollTop + 8 + Math.max(0, (lineHeight - height) / 2);
      const left = rect ? rect.right - rootRect.left + this.root.scrollLeft + 2 : this.root.scrollLeft + 8;
      this.cursor.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      this.cursor.style.height = `${height}px`;
      if (this.autoScroll) {
        const cursorBottom = top + height;
        const viewBottom = this.root.scrollTop + this.root.clientHeight;
        if (cursorBottom > viewBottom - 24) {
          this.root.scrollTop = cursorBottom - this.root.clientHeight + 24;
        }
      }
    });
  }
  destroy() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    window.removeEventListener("resize", this.handleViewportChange);
    window.removeEventListener("scroll", this.handleViewportChange, true);
    this.cursor.remove();
  }
  handleViewportChange = () => {
    this.update();
  };
};

// src/typewriter.ts
var FENCE_PATTERN2 = /^ {0,3}(`{3,}|~{3,})(.*)$/;
var SENTENCE_END_PATTERN = /[.!?。！？]$/;
var CLAUSE_END_PATTERN = /[,;:，；：、]$/;
function startsFenceLine(line) {
  return /^ {0,3}(`{3,}|~{3,})/.test(line);
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function isPreferredBreak(char) {
  return /\s/.test(char) || /[,.!?;:，。！？；：、`]/.test(char);
}
function isStrongBreak(char) {
  return /\n/.test(char) || /[.!?。！？]/.test(char);
}
function findChunkEnd(text, start, minChunkSize, maxChunkSize, inFence) {
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
function computeDelay(chunk, baseDelayMs, inFence) {
  const trimmed = chunk.trimEnd();
  const lastChar = trimmed.at(-1) ?? chunk.at(-1) ?? "";
  let delay = baseDelayMs;
  if (trimmed.endsWith("```") || trimmed.endsWith("~~~")) {
    delay += baseDelayMs * 2.4;
  } else if (SENTENCE_END_PATTERN.test(lastChar)) {
    delay += baseDelayMs * 1.8;
  } else if (CLAUSE_END_PATTERN.test(lastChar)) {
    delay += baseDelayMs * 1.1;
  } else if (lastChar === "\n") {
    delay += baseDelayMs * 0.7;
  } else if (/\s/.test(lastChar)) {
    delay += baseDelayMs * 0.2;
  }
  if (inFence) {
    delay += baseDelayMs * 0.35;
  }
  return Math.max(0, Math.round(delay));
}
function updateFenceState(chunk, inFence, carry) {
  const combined = carry + chunk;
  const lines = combined.split("\n");
  const nextCarry = combined.endsWith("\n") ? "" : lines.pop() ?? "";
  let nextFence = inFence;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    const match = trimmed.match(FENCE_PATTERN2);
    const fenceToken = match?.[1];
    if (!fenceToken) {
      continue;
    }
    if (!nextFence) {
      nextFence = true;
      continue;
    }
    const firstFenceChar = fenceToken[0];
    const trimmedBody = trimmed.replace(/^ {0,3}/, "");
    if (firstFenceChar && trimmedBody.startsWith(firstFenceChar)) {
      nextFence = false;
    }
  }
  return {
    inFence: nextFence,
    carry: nextCarry
  };
}
function normalizeOptions(options) {
  return {
    baseDelayMs: options.baseDelayMs ?? 26,
    minChunkSize: options.minChunkSize ?? 2,
    maxChunkSize: options.maxChunkSize ?? 14,
    onChunk: options.onChunk,
    onComplete: options.onComplete ?? (() => {
    }),
    onPause: options.onPause ?? (() => {
    }),
    onResume: options.onResume ?? (() => {
    }),
    onStart: options.onStart ?? (() => {
    }),
    onStateChange: options.onStateChange ?? (() => {
    }),
    onStop: options.onStop ?? (() => {
    })
  };
}
var BaseMarkdownTypewriter = class {
  options;
  timer = null;
  cursor = 0;
  running = false;
  state = "idle";
  inFence = false;
  lineCarry = "";
  constructor(options) {
    this.options = normalizeOptions(options);
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.transition("running");
    this.options.onStart(this.getEventMeta());
    this.kick();
  }
  pause() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.clearTimer();
    this.transition("paused");
    this.options.onPause(this.getEventMeta());
  }
  resume() {
    if (this.running) {
      return;
    }
    if (this.isInputClosed() && this.cursor >= this.getText().length) {
      return;
    }
    this.running = true;
    this.transition("running");
    this.options.onResume(this.getEventMeta());
    this.kick();
  }
  stop() {
    this.running = false;
    this.clearTimer();
    this.cursor = 0;
    this.inFence = false;
    this.lineCarry = "";
    this.transition("stopped");
    this.options.onStop(this.getEventMeta());
  }
  isRunning() {
    return this.running;
  }
  kick() {
    if (!this.running || this.timer !== null) {
      return;
    }
    if (this.cursor < this.getText().length) {
      this.scheduleNext(0);
      return;
    }
    this.completeIfReady();
  }
  getEventMeta(lastChunk) {
    const visibleInCodeFence = this.inFence || startsFenceLine(this.lineCarry);
    return {
      state: this.state,
      cursor: this.cursor,
      total: this.getText().length,
      closed: this.isInputClosed(),
      inCodeFence: visibleInCodeFence,
      lastChunk
    };
  }
  transition(nextState, lastChunk) {
    if (this.state === nextState) {
      return;
    }
    this.state = nextState;
    this.options.onStateChange(this.getEventMeta(lastChunk));
  }
  scheduleNext(delayMs) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delayMs);
  }
  clearTimer() {
    if (this.timer === null) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
  }
  completeIfReady(lastChunk) {
    if (!this.isInputClosed() || this.cursor < this.getText().length) {
      return;
    }
    this.running = false;
    this.clearTimer();
    this.transition("completed", lastChunk);
    this.options.onComplete(this.getEventMeta(lastChunk));
  }
  tick() {
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
      this.options.maxChunkSize
    );
    const end = findChunkEnd(
      text,
      this.cursor,
      minChunkSize,
      maxChunkSize,
      this.inFence
    );
    const chunk = text.slice(this.cursor, end);
    this.cursor = end;
    const fenceState = updateFenceState(chunk, this.inFence, this.lineCarry);
    this.inFence = fenceState.inFence;
    this.lineCarry = fenceState.carry;
    const closed = this.isInputClosed();
    const visibleInCodeFence = this.inFence || startsFenceLine(this.lineCarry);
    const done = closed && this.cursor >= this.getText().length;
    const delayMs = done ? 0 : computeDelay(chunk, this.options.baseDelayMs, this.inFence);
    const meta = {
      chunk,
      chunkSize: chunk.length,
      delayMs,
      done,
      closed,
      inCodeFence: visibleInCodeFence,
      cursor: this.cursor,
      total: this.getText().length
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
};
var MarkdownTypewriter = class extends BaseMarkdownTypewriter {
  text;
  constructor(text, options) {
    super(options);
    this.text = text;
  }
  getText() {
    return this.text;
  }
  isInputClosed() {
    return true;
  }
};
var StreamingMarkdownTypewriter = class extends BaseMarkdownTypewriter {
  text = "";
  closed = false;
  constructor(options) {
    super(options);
  }
  push(chunk) {
    if (this.closed) {
      throw new Error("Cannot push more markdown after close().");
    }
    if (!chunk) {
      return;
    }
    this.text += chunk;
    this.kick();
  }
  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.kick();
  }
  isClosed() {
    return this.closed;
  }
  getText() {
    return this.text;
  }
  isInputClosed() {
    return this.closed;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DefaultBlockRenderer,
  IncrementalDomRenderer,
  MarkdownTypewriter,
  StreamMarkdownRenderer,
  StreamingMarkdownTypewriter,
  TypewriterCursorController,
  createContainerExtension,
  createDefaultHtmlSanitizer,
  createHighlightExtension,
  createHtmlSanitizer,
  createMathExtension,
  diffAst,
  digestTokens,
  extractStableBlocks,
  renderMarkdown,
  renderMarkdownToString,
  wrapBlockHtml
});
