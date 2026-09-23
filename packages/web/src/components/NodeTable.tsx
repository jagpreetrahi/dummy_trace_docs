import { useMemo, useState } from 'react';
import type { GraphNode } from '@tracedocs/core';
import { nodeTypeLabel } from '../labels';

export interface NodeTableProps {
  nodes: GraphNode[];
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
}

/**
 * A plain HTML table over the same node data the graph canvas renders —
 * the accessible alternative to the visualization required by the brief,
 * for anyone who can't or doesn't want to read the node-link diagram.
 */
export function NodeTable({ nodes, selectedNodeId, onSelectNode }: NodeTableProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return nodes;
    return nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(needle) ||
        node.qualifiedName?.toLowerCase().includes(needle) ||
        node.filePath?.toLowerCase().includes(needle),
    );
  }, [nodes, filter]);

  return (
    <div className="node-table-wrapper">
      <label htmlFor="table-filter">Filter table</label>
      <input
        id="table-filter"
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or file…"
      />
      <table>
        <caption className="visually-hidden">Nodes currently loaded in the graph</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Name</th>
            <th scope="col">File</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((node) => (
            <tr
              key={node.id}
              className={node.id === selectedNodeId ? 'selected-row' : ''}
              onClick={() => onSelectNode(node.id)}
            >
              <td>{nodeTypeLabel(node.type)}</td>
              <td>{node.qualifiedName ?? node.name}</td>
              <td>{node.filePath ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">No nodes match.</p>}
    </div>
  );
}
