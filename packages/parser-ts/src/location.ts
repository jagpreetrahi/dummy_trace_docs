import ts from 'typescript';
import type { SourceLocation } from '@tracedocs/core';

export function toLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}
