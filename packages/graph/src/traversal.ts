import type { GraphEdge, GraphEdgeType, GraphNode } from '@tracedocs/core';
import type { GraphStore } from './graphStore.js';

export type TraverseDirection = 'out' | 'in' | 'both';

export interface TraverseOptions {
  direction: TraverseDirection;
  maxDepth: number;
  edgeTypes?: GraphEdgeType[];
}

export interface TraverseStep {
  node: GraphNode;
  depth: number;
  /** The edge that reached this node during traversal; `null` for the start node. */
  viaEdge: GraphEdge | null;
}

export interface PathStep {
  node: GraphNode;
  /** The edge connecting the previous step's node to this one; `null` for the first step. */
  viaEdge: GraphEdge | null;
}

function collectEdges(
  store: GraphStore,
  nodeId: number,
  direction: TraverseDirection,
  edgeTypes: GraphEdgeType[] | undefined,
): GraphEdge[] {
  const fetch = (dir: 'out' | 'in') => {
    const list = dir === 'out' ? store.listOutgoingEdges.bind(store) : store.listIncomingEdges.bind(store);
    if (!edgeTypes) return list(nodeId);
    return edgeTypes.flatMap((type) => list(nodeId, type));
  };
  const out = direction === 'out' || direction === 'both' ? fetch('out') : [];
  const inn = direction === 'in' || direction === 'both' ? fetch('in') : [];
  return [...out, ...inn];
}

/**
 * Breadth-first, bounded-depth traversal from `startNodeId`. A visited set
 * guarantees termination and exactly-once visitation even if the graph
 * contains cycles. The start node itself is included at depth 0.
 */
export function traverse(
  store: GraphStore,
  startNodeId: number,
  options: TraverseOptions,
): TraverseStep[] {
  const startNode = store.getNodeById(startNodeId);
  if (!startNode) return [];

  const visited = new Set<number>([startNodeId]);
  const results: TraverseStep[] = [{ node: startNode, depth: 0, viaEdge: null }];
  let frontier = [startNodeId];

  for (let depth = 1; depth <= options.maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: number[] = [];
    for (const nodeId of frontier) {
      for (const edge of collectEdges(store, nodeId, options.direction, options.edgeTypes)) {
        const neighborId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const neighborNode = store.getNodeById(neighborId);
        if (!neighborNode) continue;
        results.push({ node: neighborNode, depth, viaEdge: edge });
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return results;
}

/**
 * Shortest path (fewest edges) between two nodes, found via BFS. Returns
 * `null` if no path exists within `maxDepth`. Direction defaults to `both`
 * since explaining *how* two nodes relate shouldn't require the caller to
 * already know which one points at the other.
 */
export function findPath(
  store: GraphStore,
  fromNodeId: number,
  toNodeId: number,
  options: Omit<TraverseOptions, 'direction'> & { direction?: TraverseDirection },
): PathStep[] | null {
  const direction = options.direction ?? 'both';
  const startNode = store.getNodeById(fromNodeId);
  if (!startNode) return null;

  if (fromNodeId === toNodeId) {
    return [{ node: startNode, viaEdge: null }];
  }

  const parent = new Map<number, { fromId: number; edge: GraphEdge }>();
  const visited = new Set<number>([fromNodeId]);
  let frontier = [fromNodeId];

  for (let depth = 1; depth <= options.maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: number[] = [];
    for (const nodeId of frontier) {
      for (const edge of collectEdges(store, nodeId, direction, options.edgeTypes)) {
        const neighborId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, { fromId: nodeId, edge });
        if (neighborId === toNodeId) {
          return reconstructPath(store, fromNodeId, toNodeId, parent);
        }
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return null;
}

function reconstructPath(
  store: GraphStore,
  fromNodeId: number,
  toNodeId: number,
  parent: Map<number, { fromId: number; edge: GraphEdge }>,
): PathStep[] {
  const steps: PathStep[] = [];
  let currentId = toNodeId;

  while (currentId !== fromNodeId) {
    const entry = parent.get(currentId);
    if (!entry) break;
    const node = store.getNodeById(currentId);
    if (node) steps.unshift({ node, viaEdge: entry.edge });
    currentId = entry.fromId;
  }

  const startNode = store.getNodeById(fromNodeId);
  if (startNode) steps.unshift({ node: startNode, viaEdge: null });
  return steps;
}
