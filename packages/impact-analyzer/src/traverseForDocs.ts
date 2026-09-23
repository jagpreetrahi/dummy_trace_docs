import type { GraphNode } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';

export interface DocCandidate {
  docNode: GraphNode;
  /** From the changed symbol itself to the doc node, inclusive of both ends. Never fabricated — every step is a real edge just walked. */
  path: GraphNode[];
  /** Number of CONTAINS hops from the changed symbol to whichever node actually has the DOCUMENTS edge. 0 = the symbol itself is documented directly. */
  depth: number;
}

/**
 * Starting from a changed symbol, looks for documentation two ways at
 * each step outward: (1) does *this* node have an outgoing DOCUMENTS
 * edge, and (2) what contains this node (walking incoming CONTAINS edges
 * — method → class → file), repeating up to `maxDepth` hops. This mirrors
 * the brief's own worked example (`refreshAccessToken() → AuthenticationService
 * → docs/authentication.md`): a change to a method can be relevant to
 * documentation written about its class or file, not just about the
 * method by name. Only CONTAINS is walked for "what's this part of" —
 * CALLS is deliberately not, since "the things I call might be documented
 * somewhere" is a much weaker, noisier signal than "the thing I'm part of
 * is documented" (see `docs/architecture.md`).
 */
export function traverseForDocs(store: GraphStore, startNodeId: number, maxDepth: number): DocCandidate[] {
  const startNode = store.getNodeById(startNodeId);
  if (!startNode) return [];

  const results: DocCandidate[] = [];
  const visited = new Set<number>([startNode.id]);
  let frontier: { node: GraphNode; path: GraphNode[] }[] = [{ node: startNode, path: [startNode] }];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: typeof frontier = [];

    for (const { node, path } of frontier) {
      for (const edge of store.listOutgoingEdges(node.id, 'DOCUMENTS')) {
        const docNode = store.getNodeById(edge.targetNodeId);
        if (docNode) results.push({ docNode, path: [...path, docNode], depth });
      }

      if (depth < maxDepth) {
        for (const edge of store.listIncomingEdges(node.id, 'CONTAINS')) {
          if (visited.has(edge.sourceNodeId)) continue;
          const containerNode = store.getNodeById(edge.sourceNodeId);
          if (!containerNode) continue;
          visited.add(containerNode.id);
          nextFrontier.push({ node: containerNode, path: [...path, containerNode] });
        }
      }
    }

    frontier = nextFrontier;
  }

  return results;
}
