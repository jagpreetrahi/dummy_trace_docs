import type { GraphEdge, GraphNode } from '@tracedocs/core';
import { edgeTypeLabel, nodeTypeLabel } from '../labels';

export interface NodeDetailsProps {
  node: GraphNode | null;
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
  /** Looked up by id to show a name instead of a bare number for each edge's other end. */
  nodesById: ReadonlyMap<number, GraphNode>;
  onSelectNode: (nodeId: number) => void;
  onExpand: () => void;
  onSetAsFrom: () => void;
  onSetAsTo: () => void;
  expanding: boolean;
}

function describeNeighbor(id: number, nodesById: ReadonlyMap<number, GraphNode>): string {
  const neighbor = nodesById.get(id);
  return neighbor ? neighbor.qualifiedName ?? neighbor.name : `#${id}`;
}

function EdgeList({
  title,
  edges,
  endpoint,
  nodesById,
  onSelectNode,
}: {
  title: string;
  edges: GraphEdge[];
  endpoint: 'source' | 'target';
  nodesById: ReadonlyMap<number, GraphNode>;
  onSelectNode: (nodeId: number) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="edge-list">
        {edges.map((edge) => {
          const neighborId = endpoint === 'source' ? edge.sourceNodeId : edge.targetNodeId;
          return (
            <li key={edge.id}>
              <button type="button" onClick={() => onSelectNode(neighborId)}>
                {edgeTypeLabel(edge.type)} → {describeNeighbor(neighborId, nodesById)}
              </button>
              <span className="muted"> ({edge.evidenceType}, {edge.certainty} confidence)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NodeDetails({
  node,
  outgoing,
  incoming,
  nodesById,
  onSelectNode,
  onExpand,
  onSetAsFrom,
  onSetAsTo,
  expanding,
}: NodeDetailsProps) {
  if (!node) {
    return (
      <section className="panel" aria-label="Node details">
        <h2>Node details</h2>
        <p className="muted">Select a node (in the graph, table, or search results) to inspect it here.</p>
      </section>
    );
  }

  const jsDoc = (node.metadata as { jsDoc?: { description?: string } } | null)?.jsDoc;

  return (
    <section className="panel" aria-label="Node details">
      <h2>Node details</h2>
      <dl className="stats">
        <dt>Name</dt>
        <dd>{node.name}</dd>
        <dt>Kind</dt>
        <dd>{nodeTypeLabel(node.type)}</dd>
        {node.qualifiedName && (
          <>
            <dt>Full name</dt>
            <dd>{node.qualifiedName}</dd>
          </>
        )}
        {node.filePath && (
          <>
            <dt>File</dt>
            <dd>
              {node.filePath}
              {node.startLine ? `:${node.startLine}` : ''}
              {node.endLine && node.endLine !== node.startLine ? `-${node.endLine}` : ''}
            </dd>
          </>
        )}
        {jsDoc?.description && (
          <>
            <dt>Doc comment</dt>
            <dd>{jsDoc.description}</dd>
          </>
        )}
      </dl>

      <div className="button-row">
        <button type="button" onClick={onExpand} disabled={expanding}>
          {expanding ? 'Expanding…' : 'Expand neighbors'}
        </button>
        <button type="button" onClick={onSetAsFrom}>
          Set as path "From"
        </button>
        <button type="button" onClick={onSetAsTo}>
          Set as path "To"
        </button>
      </div>
      <p className="hint">"Expand neighbors" reveals what this connects to, so you can explore step by step.</p>

      <EdgeList title="Outgoing" edges={outgoing} endpoint="target" nodesById={nodesById} onSelectNode={onSelectNode} />
      <EdgeList title="Incoming" edges={incoming} endpoint="source" nodesById={nodesById} onSelectNode={onSelectNode} />
    </section>
  );
}
