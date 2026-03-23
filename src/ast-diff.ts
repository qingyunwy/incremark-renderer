import type { AstNodePatch, TokensList } from './types.js';

// `marked` nests child tokens in different properties depending on the block kind.
// Normalizing that shape lets the diff walker stay generic.
function getChildren(token: Record<string, unknown>): TokensList {
  const nested: TokensList = [];

  if (Array.isArray(token.tokens)) {
    nested.push(...(token.tokens as TokensList));
  }

  if (Array.isArray(token.items)) {
    for (const item of token.items as Array<Record<string, unknown>>) {
      if (Array.isArray(item.tokens)) {
        nested.push(...(item.tokens as TokensList));
      }
      if (Array.isArray(item.items)) {
        nested.push(...(item.items as TokensList));
      }
    }
  }

  return nested;
}

// The digest intentionally ignores object key order. This gives us a stable structural
// fingerprint for cheap "did anything inside this subtree change?" checks.
function digestValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(digestValue).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'tokens')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}:${digestValue(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

export function digestTokens(tokens: TokensList): string {
  return tokens
    .map((token) => {
      const base = digestValue(token);
      const children = getChildren(token as unknown as Record<string, unknown>);
      return children.length > 0 ? `${base}<${digestTokens(children)}>` : base;
    })
    .join('|');
}

function tokenType(token?: Record<string, unknown>): string | undefined {
  if (!token) {
    return undefined;
  }
  return typeof token.type === 'string' ? token.type : 'unknown';
}

// The diff is block-local and positional on purpose: once stable block boundaries are
// determined, we care more about fast replacement decisions than about producing a
// minimal tree-edit script.
function diffTokenLists(
  previous: TokensList,
  next: TokensList,
  basePath: string,
  patches: AstNodePatch[],
): void {
  const length = Math.max(previous.length, next.length);
  for (let index = 0; index < length; index += 1) {
    const prevToken = previous[index] as Record<string, unknown> | undefined;
    const nextToken = next[index] as Record<string, unknown> | undefined;
    const path = `${basePath}/${index}`;

    if (!prevToken && nextToken) {
      patches.push({ path, kind: 'add', nextType: tokenType(nextToken) });
      continue;
    }

    if (prevToken && !nextToken) {
      patches.push({ path, kind: 'remove', prevType: tokenType(prevToken) });
      continue;
    }

    if (!prevToken || !nextToken) {
      continue;
    }

    const prevDigest = digestValue(prevToken);
    const nextDigest = digestValue(nextToken);
    // A digest mismatch means the node itself changed enough that the caller should
    // replace the corresponding rendered fragment instead of descending further.
    if (prevDigest !== nextDigest) {
      patches.push({
        path,
        kind: 'replace',
        prevType: tokenType(prevToken),
        nextType: tokenType(nextToken),
      });
      continue;
    }

    diffTokenLists(
      getChildren(prevToken),
      getChildren(nextToken),
      `${path}/children`,
      patches,
    );
  }
}

export function diffAst(previous: TokensList, next: TokensList): AstNodePatch[] {
  const patches: AstNodePatch[] = [];
  diffTokenLists(previous, next, 'root', patches);
  return patches;
}
