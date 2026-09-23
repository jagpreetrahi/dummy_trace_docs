import type { Position } from 'unist';
import type { SourceLocation } from '@tracedocs/core';

/** unist positions are already 1-based, matching our SourceLocation convention. */
export function toLocationFromPosition(position: Position | undefined): SourceLocation {
  if (!position) {
    return { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
  }
  return {
    startLine: position.start.line,
    startColumn: position.start.column,
    endLine: position.end.line,
    endColumn: position.end.column,
  };
}
