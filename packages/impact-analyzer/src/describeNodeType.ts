import type { GraphNodeType } from '@tracedocs/core';

const LABELS: Record<GraphNodeType, string> = {
  file: 'file',
  documentation_page: 'documentation page',
  documentation_section: 'documentation section',
  class: 'class',
  function: 'function',
  method: 'method',
};

export function describeNodeType(type: GraphNodeType): string {
  return LABELS[type];
}
