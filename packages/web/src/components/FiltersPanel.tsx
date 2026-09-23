import type { GraphEdgeType, GraphNodeType } from '@tracedocs/core';
import { EDGE_TYPE_INFO, NODE_TYPE_INFO } from '../labels';

export const NODE_TYPES: GraphNodeType[] = [
  'file',
  'documentation_page',
  'documentation_section',
  'class',
  'function',
  'method',
];

export const EDGE_TYPES: GraphEdgeType[] = ['CONTAINS', 'IMPORTS', 'CALLS', 'DOCUMENTS'];

export interface FiltersPanelProps {
  nodeTypes: Set<GraphNodeType>;
  edgeTypes: Set<GraphEdgeType>;
  limit: number;
  depth: number;
  onToggleNodeType: (type: GraphNodeType) => void;
  onToggleEdgeType: (type: GraphEdgeType) => void;
  onLimitChange: (limit: number) => void;
  onDepthChange: (depth: number) => void;
  onReload: () => void;
}

export function FiltersPanel({
  nodeTypes,
  edgeTypes,
  limit,
  depth,
  onToggleNodeType,
  onToggleEdgeType,
  onLimitChange,
  onDepthChange,
  onReload,
}: FiltersPanelProps) {
  return (
    <section className="panel" aria-label="Filters">
      <h2>Filters</h2>

      <fieldset>
        <legend>Show these kinds of things</legend>
        {NODE_TYPES.map((type) => (
          <label key={type} className="checkbox-row" title={NODE_TYPE_INFO[type].description}>
            <input
              type="checkbox"
              checked={nodeTypes.has(type)}
              onChange={() => onToggleNodeType(type)}
            />
            {NODE_TYPE_INFO[type].label}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Show these relationships</legend>
        {EDGE_TYPES.map((type) => (
          <label key={type} className="checkbox-row" title={EDGE_TYPE_INFO[type].description}>
            <input
              type="checkbox"
              checked={edgeTypes.has(type)}
              onChange={() => onToggleEdgeType(type)}
            />
            {EDGE_TYPE_INFO[type].label}
          </label>
        ))}
      </fieldset>

      <label htmlFor="limit-input">Max nodes</label>
      <input
        id="limit-input"
        type="number"
        min={10}
        max={2000}
        value={limit}
        onChange={(e) => onLimitChange(Number(e.target.value))}
      />

      <label htmlFor="depth-input">Expansion depth</label>
      <input
        id="depth-input"
        type="number"
        min={1}
        max={5}
        value={depth}
        onChange={(e) => onDepthChange(Number(e.target.value))}
      />

      <button type="button" onClick={onReload}>
        Reload graph
      </button>
    </section>
  );
}
