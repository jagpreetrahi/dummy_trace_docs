import type { CodeSymbolKind } from '@tracedocs/core';

const KIND_LABELS: Record<CodeSymbolKind, string> = {
  file: 'File',
  class: 'Class',
  function: 'Function',
  method: 'Method',
};

export function describeKind(kind: CodeSymbolKind): string {
  return KIND_LABELS[kind];
}
