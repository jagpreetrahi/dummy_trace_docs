/**
 * Types for the persistent dependency graph (Milestone 3).
 *
 * Node/edge *types* are deliberately a narrow subset of the full list in
 * the project brief — only what Milestone 3's indexer actually populates.
 * Widening these unions (e.g. adding `api_endpoint`, `TESTS`, `REFERENCES`)
 * happens alongside the milestone that starts writing them; an unused
 * variant in a union is a lie about what the system does.
 */

export type GraphNodeType =
  | 'file'
  | 'documentation_page'
  | 'documentation_section'
  | 'class'
  | 'function'
  | 'method';

export type GraphEdgeType = 'CONTAINS' | 'IMPORTS' | 'CALLS' | 'DOCUMENTS';

export type EvidenceType =
  | 'static_analysis'
  | 'explicit_annotation'
  | 'documentation_link'
  | 'ai_inferred';

/**
 * Interpretable labels, not calibrated probabilities. See
 * `docs/architecture.md` for how each edge type assigns these.
 */
export type Certainty = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvidenceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface GraphNode {
  id: number;
  repositoryId: number;
  /** The parser/indexer-produced stable id, e.g. `src/auth/token.ts#refreshAccessToken:function`. */
  stableId: string;
  type: GraphNodeType;
  name: string;
  qualifiedName: string | null;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  contentHash: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NewGraphNode {
  stableId: string;
  type: GraphNodeType;
  name: string;
  qualifiedName?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: number;
  repositoryId: number;
  sourceNodeId: number;
  targetNodeId: number;
  type: GraphEdgeType;
  evidenceType: EvidenceType;
  evidenceLocation: EvidenceLocation | null;
  certainty: Certainty;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating an edge, addressed by stable id rather than internal
 * database id — callers building a graph from parsed files never need to
 * know or track surrogate row ids.
 */
export interface NewGraphEdge {
  sourceStableId: string;
  targetStableId: string;
  type: GraphEdgeType;
  evidenceType: EvidenceType;
  evidenceLocation?: EvidenceLocation;
  certainty: Certainty;
  metadata?: Record<string, unknown>;
}
