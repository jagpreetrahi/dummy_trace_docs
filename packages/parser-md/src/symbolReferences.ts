import type { InlineCode, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { SymbolReference } from '@tracedocs/core';
import { toLocationFromPosition } from './location.js';

const FILE_PATH_PATTERN = /^[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|json)$/i;
const SYMBOL_LIKE_PATTERN = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*(\(\))?$/;

/**
 * Heuristically classifies inline code spans that look like a reference to
 * a file or a code symbol. This is evidence for the impact analyzer to
 * weigh (Milestone 6) — it is never treated as a resolved relationship on
 * its own.
 */
export function extractSymbolReferences(root: Root): SymbolReference[] {
  const references: SymbolReference[] = [];

  visit(root, 'inlineCode', (node: InlineCode) => {
    const raw = node.value;
    let kind: SymbolReference['kind'] | undefined;

    if (raw.includes('/') || FILE_PATH_PATTERN.test(raw)) {
      kind = 'file-path';
    } else if (SYMBOL_LIKE_PATTERN.test(raw)) {
      kind = 'symbol-like';
    }

    if (!kind) return;
    references.push({ raw, kind, location: toLocationFromPosition(node.position) });
  });

  return references;
}
