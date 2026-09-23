import type { GraphEdgeType, GraphNodeType } from '@tracedocs/core';

/**
 * Human-readable labels, colors, and one-line explanations for the raw
 * type strings the API returns. The API keeps the exact wording from the
 * project's data model (`documentation_section`, `CALLS`, ...); the UI
 * translates it so nobody has to already understand the graph schema to
 * read the screen.
 */
export const NODE_TYPE_INFO: Record<GraphNodeType, { label: string; description: string; color: string }> = {
  file: { label: 'File', description: 'A source code file', color: '#6b7280' },
  documentation_page: {
    label: 'Doc page',
    description: 'A Markdown documentation file',
    color: '#0ea5e9',
  },
  documentation_section: {
    label: 'Doc section',
    description: 'One heading\'s worth of content within a doc page',
    color: '#38bdf8',
  },
  class: { label: 'Class', description: 'A class declaration', color: '#a855f7' },
  function: { label: 'Function', description: 'A standalone function', color: '#22c55e' },
  method: { label: 'Method', description: 'A method defined on a class', color: '#84cc16' },
};

export const EDGE_TYPE_INFO: Record<GraphEdgeType, { label: string; description: string }> = {
  CONTAINS: { label: 'Contains', description: 'The first thing contains the second (e.g. a file contains a function)' },
  IMPORTS: { label: 'Imports', description: 'The first file imports the second file' },
  CALLS: { label: 'Calls', description: 'The first function or method calls the second' },
  DOCUMENTS: {
    label: 'Documents',
    description: 'The code is documented by that section (written as a comment in the docs)',
  },
};

export function nodeTypeLabel(type: GraphNodeType): string {
  return NODE_TYPE_INFO[type]?.label ?? type;
}

export function edgeTypeLabel(type: GraphEdgeType): string {
  return EDGE_TYPE_INFO[type]?.label ?? type;
}
