import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { GraphEdge, GraphNode } from '@tracedocs/core';
import { edgeTypeLabel, NODE_TYPE_INFO } from '../labels';
import { Legend } from './Legend';

function toElements(nodes: GraphNode[], edges: GraphEdge[]): ElementDefinition[] {
  const nodeEls: ElementDefinition[] = nodes.map((node) => ({
    data: {
      id: String(node.id),
      label: node.qualifiedName ?? node.name,
      type: node.type,
    },
  }));
  const edgeEls: ElementDefinition[] = edges.map((edge) => ({
    data: {
      id: `e${edge.id}`,
      source: String(edge.sourceNodeId),
      target: String(edge.targetNodeId),
      label: edgeTypeLabel(edge.type),
    },
  }));
  return [...nodeEls, ...edgeEls];
}

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: number | null;
  highlightedNodeIds: ReadonlySet<number>;
  highlightedEdgeIds: ReadonlySet<number>;
  onSelectNode: (nodeId: number) => void;
}

/**
 * Thin, direct integration with the `cytoscape` core library rather than a
 * React wrapper package — the imperative lifecycle (init once, mutate the
 * element set on data changes, toggle classes on selection/highlight
 * changes) is a handful of `useEffect`s and doesn't need an abstraction on
 * top of it.
 */
export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  highlightedNodeIds,
  highlightedEdgeIds,
  onSelectNode,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (el) => NODE_TYPE_INFO[el.data('type') as GraphNode['type']]?.color ?? '#94a3b8',
            label: 'data(label)',
            'font-size': 9,
            width: 24,
            height: 24,
            color: '#1f2937',
            'text-valign': 'bottom',
            'text-margin-y': 4,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'font-size': 7,
            label: 'data(label)',
            color: '#64748b',
          },
        },
        {
          selector: 'node.selected',
          style: { 'border-width': 3, 'border-color': '#f97316' },
        },
        {
          selector: 'node.highlighted',
          style: { 'background-color': '#f97316' },
        },
        {
          selector: 'edge.highlighted',
          style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316', width: 3 },
        },
      ],
    });
    cy.on('tap', 'node', (event) => {
      onSelectNode(Number(event.target.id()));
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; onSelectNode is stable enough for this scale
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(toElements(nodes, edges));
    cy.layout({ name: 'cose', animate: false }).run();
  }, [nodes, edges]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('selected highlighted');
    if (selectedNodeId !== null) cy.getElementById(String(selectedNodeId)).addClass('selected');
    for (const id of highlightedNodeIds) cy.getElementById(String(id)).addClass('highlighted');
    for (const id of highlightedEdgeIds) cy.getElementById(`e${id}`).addClass('highlighted');
  }, [selectedNodeId, highlightedNodeIds, highlightedEdgeIds]);

  return (
    <div className="graph-canvas-wrapper">
      <p className="hint">
        Click a node to see its details on the right. Orange = selected, or part of a highlighted path.
      </p>
      <div
        ref={containerRef}
        className="graph-canvas"
        role="img"
        aria-label="Dependency graph visualization"
      />
      <Legend />
    </div>
  );
}
