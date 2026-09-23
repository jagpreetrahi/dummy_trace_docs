import type {
  Certainty,
  EvidenceLocation,
  EvidenceType,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphNodeType,
} from '@tracedocs/core';

interface NodeRow {
  id: number;
  repository_id: number;
  stable_id: string;
  type: string;
  name: string;
  qualified_name: string | null;
  file_path: string | null;
  start_line: number | null;
  end_line: number | null;
  content_hash: string | null;
  metadata_json: string | null;
}

export function mapNodeRow(row: NodeRow): GraphNode {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    stableId: row.stable_id,
    type: row.type as GraphNodeType,
    name: row.name,
    qualifiedName: row.qualified_name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    contentHash: row.content_hash,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
  };
}

interface EdgeRow {
  id: number;
  repository_id: number;
  source_node_id: number;
  target_node_id: number;
  type: string;
  evidence_type: string;
  evidence_location_json: string | null;
  certainty: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export function mapEdgeRow(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    type: row.type as GraphEdgeType,
    evidenceType: row.evidence_type as EvidenceType,
    evidenceLocation: row.evidence_location_json
      ? (JSON.parse(row.evidence_location_json) as EvidenceLocation)
      : null,
    certainty: row.certainty as Certainty,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
