import { createHash } from 'node:crypto';
import type { SourceLocation } from '@tracedocs/core';

/** Extracts the (1-based, inclusive) line range a symbol occupies within its own file's content. */
export function sliceLines(content: string, location: SourceLocation): string {
  const lines = content.split('\n');
  return lines.slice(location.startLine - 1, location.endLine).join('\n');
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
