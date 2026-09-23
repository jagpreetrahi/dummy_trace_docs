import ts from 'typescript';
import type { JSDocInfo } from '@tracedocs/core';

/**
 * Extracts the JSDoc comment immediately preceding a node, using only
 * public TypeScript APIs (leading comment ranges), rather than the
 * internal `.jsDoc` node property.
 */
export function getJsDoc(node: ts.Node, sourceFile: ts.SourceFile): JSDocInfo | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) return undefined;

  const jsDocRange = ranges.find((range) => fullText.slice(range.pos, range.pos + 3) === '/**');
  if (!jsDocRange) return undefined;

  const raw = fullText.slice(jsDocRange.pos, jsDocRange.end);
  return parseJsDocComment(raw);
}

function parseJsDocComment(raw: string): JSDocInfo {
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.trim().replace(/^\*\s?/, ''));

  const descriptionLines: string[] = [];
  const tags: JSDocInfo['tags'] = [];

  for (const line of lines) {
    const tagMatch = /^@(\w+)\s*(.*)$/.exec(line);
    if (tagMatch) {
      tags.push({ tag: tagMatch[1] ?? '', text: (tagMatch[2] ?? '').trim() });
    } else if (line.length > 0 && tags.length === 0) {
      descriptionLines.push(line);
    }
  }

  const description = descriptionLines.join(' ').trim();
  return { ...(description ? { description } : {}), tags };
}
