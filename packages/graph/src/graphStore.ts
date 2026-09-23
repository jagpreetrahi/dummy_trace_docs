import { DatabaseSync } from 'node:sqlite';
import type {
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphNodeType,
  NewGraphEdge,
  NewGraphNode,
} from '@tracedocs/core';
import { openDatabase } from './db.js';
import { mapEdgeRow, mapNodeRow } from './rowMapping.js';
import { findPath, traverse, type PathStep, type TraverseOptions, type TraverseStep } from './traversal.js';

export interface DanglingReference {
  sourceStableId: string;
  targetStableId: string;
  edgeType: GraphEdgeType;
}

export interface RepositorySummary {
  id: number;
  repositoryRoot: string;
  currentRevision: string | null;
  indexedAt: string | null;
}

export interface ListNodesOptions {
  types?: GraphNodeType[];
  limit?: number;
}

export interface ListEdgesOptions {
  types?: GraphEdgeType[];
  limit?: number;
}

/**
 * The typed, single entry point for all graph persistence and queries.
 * Deliberately not a general query language — every method here exists
 * because a specific use case from the project brief needs it.
 */
export class GraphStore {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path: string): GraphStore {
    return new GraphStore(openDatabase(path));
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------------
  // Repositories
  // ---------------------------------------------------------------------

  upsertRepository(repositoryRoot: string): number {
    const existing = this.db
      .prepare('SELECT id FROM repositories WHERE repository_root = ?')
      .get(repositoryRoot) as { id: number } | undefined;
    if (existing) return existing.id;

    const row = this.db
      .prepare('INSERT INTO repositories (repository_root) VALUES (?) RETURNING id')
      .get(repositoryRoot) as { id: number };
    return row.id;
  }

  markRepositoryIndexed(repositoryId: number, revision: string | null, indexedAt: string): void {
    this.db
      .prepare('UPDATE repositories SET current_revision = ?, indexed_at = ? WHERE id = ?')
      .run(revision, indexedAt, repositoryId);
  }

  listRepositories(): RepositorySummary[] {
    const rows = this.db
      .prepare('SELECT id, repository_root, current_revision, indexed_at FROM repositories ORDER BY id')
      .all() as { id: number; repository_root: string; current_revision: string | null; indexed_at: string | null }[];
    return rows.map((row) => ({
      id: row.id,
      repositoryRoot: row.repository_root,
      currentRevision: row.current_revision,
      indexedAt: row.indexed_at,
    }));
  }

  getRepository(repositoryId: number): RepositorySummary | undefined {
    const row = this.db
      .prepare('SELECT id, repository_root, current_revision, indexed_at FROM repositories WHERE id = ?')
      .get(repositoryId) as
      | { id: number; repository_root: string; current_revision: string | null; indexed_at: string | null }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      repositoryRoot: row.repository_root,
      currentRevision: row.current_revision,
      indexedAt: row.indexed_at,
    };
  }

  // ---------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------

  upsertFile(
    repositoryId: number,
    path: string,
    language: string,
    contentHash: string,
    lastIndexedAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO files (repository_id, path, language, content_hash, last_indexed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (repository_id, path)
         DO UPDATE SET language = excluded.language,
                       content_hash = excluded.content_hash,
                       last_indexed_at = excluded.last_indexed_at`,
      )
      .run(repositoryId, path, language, contentHash, lastIndexedAt);
  }

  deleteFile(repositoryId: number, path: string): void {
    this.db.prepare('DELETE FROM files WHERE repository_id = ? AND path = ?').run(repositoryId, path);
  }

  listFiles(repositoryId: number): { path: string; language: string; contentHash: string }[] {
    const rows = this.db
      .prepare('SELECT path, language, content_hash FROM files WHERE repository_id = ?')
      .all(repositoryId) as { path: string; language: string; content_hash: string }[];
    return rows.map((row) => ({ path: row.path, language: row.language, contentHash: row.content_hash }));
  }

  countFiles(repositoryId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM files WHERE repository_id = ?')
      .get(repositoryId) as { count: number };
    return row.count;
  }

  // ---------------------------------------------------------------------
  // Nodes
  // ---------------------------------------------------------------------

  upsertNode(repositoryId: number, node: NewGraphNode): number {
    const row = this.db
      .prepare(
        `INSERT INTO nodes
           (repository_id, stable_id, type, name, qualified_name, file_path, start_line, end_line, content_hash, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (repository_id, stable_id)
         DO UPDATE SET type = excluded.type,
                       name = excluded.name,
                       qualified_name = excluded.qualified_name,
                       file_path = excluded.file_path,
                       start_line = excluded.start_line,
                       end_line = excluded.end_line,
                       content_hash = excluded.content_hash,
                       metadata_json = excluded.metadata_json
         RETURNING id`,
      )
      .get(
        repositoryId,
        node.stableId,
        node.type,
        node.name,
        node.qualifiedName ?? null,
        node.filePath ?? null,
        node.startLine ?? null,
        node.endLine ?? null,
        node.contentHash ?? null,
        node.metadata ? JSON.stringify(node.metadata) : null,
      ) as { id: number };
    return row.id;
  }

  getNodeByStableId(repositoryId: number, stableId: string): GraphNode | undefined {
    const row = this.db
      .prepare('SELECT * FROM nodes WHERE repository_id = ? AND stable_id = ?')
      .get(repositoryId, stableId);
    return row ? mapNodeRow(row as never) : undefined;
  }

  getNodeById(nodeId: number): GraphNode | undefined {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    return row ? mapNodeRow(row as never) : undefined;
  }

  /** Matches by file + qualified name regardless of kind — annotation targets don't specify a symbol kind. */
  findNodesByFilePathAndQualifiedName(
    repositoryId: number,
    filePath: string,
    qualifiedName: string,
  ): GraphNode[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM nodes WHERE repository_id = ? AND file_path = ? AND qualified_name = ?',
      )
      .all(repositoryId, filePath, qualifiedName);
    return rows.map((row) => mapNodeRow(row as never));
  }

  /**
   * File paths of documentation with a DOCUMENTS edge from some node whose
   * `file_path` is `filePath` — i.e. "which docs currently reference
   * something in this file." The indexer uses this before reprocessing a
   * changed code file: that file's nodes are about to be deleted and
   * reinserted (even a node whose identity doesn't change loses its edges
   * in that process), so any doc that annotated it needs to be
   * reprocessed too, or its DOCUMENTS edge would just be lost rather than
   * correctly re-resolved against the fresh node.
   */
  findDocumentationFilesReferencing(repositoryId: number, filePath: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT tn.file_path AS file_path
         FROM edges e
         JOIN nodes sn ON sn.id = e.source_node_id
         JOIN nodes tn ON tn.id = e.target_node_id
         WHERE e.repository_id = ? AND e.type = 'DOCUMENTS' AND sn.file_path = ?`,
      )
      .all(repositoryId, filePath) as { file_path: string | null }[];
    return rows.map((row) => row.file_path).filter((path): path is string => path != null);
  }

  listNodesByType(repositoryId: number, type: GraphNodeType): GraphNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE repository_id = ? AND type = ?')
      .all(repositoryId, type);
    return rows.map((row) => mapNodeRow(row as never));
  }

  /**
   * Bulk node listing for the graph API, optionally filtered by type and
   * capped by `limit` — the explorer must never dump an unbounded graph
   * into one response.
   */
  listNodes(repositoryId: number, options: ListNodesOptions = {}): GraphNode[] {
    const params: unknown[] = [repositoryId];
    let sql = 'SELECT * FROM nodes WHERE repository_id = ?';

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => '?').join(', ')})`;
      params.push(...options.types);
    }
    sql += ' ORDER BY id';
    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...(params as never[]));
    return rows.map((row) => mapNodeRow(row as never));
  }

  /** Case-insensitive substring search over name, qualified name, and file path. */
  searchNodes(repositoryId: number, query: string, limit = 50): GraphNode[] {
    const pattern = `%${escapeLikePattern(query)}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes
         WHERE repository_id = ?
           AND (name LIKE ? ESCAPE '\\' OR qualified_name LIKE ? ESCAPE '\\' OR file_path LIKE ? ESCAPE '\\')
         ORDER BY name
         LIMIT ?`,
      )
      .all(repositoryId, pattern, pattern, pattern, limit);
    return rows.map((row) => mapNodeRow(row as never));
  }

  countNodes(repositoryId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM nodes WHERE repository_id = ?')
      .get(repositoryId) as { count: number };
    return row.count;
  }

  /**
   * Removes every node whose `file_path` is `path` (cascading to their
   * edges), and reports edges that crossed into or out of this file from
   * elsewhere — those relationships are now dangling because one side
   * just disappeared. Called both when a file is deleted and, before
   * re-parsing, when a file is modified (see `packages/indexer`).
   */
  deleteNodesForFile(repositoryId: number, filePath: string): DanglingReference[] {
    const nodeRows = this.db
      .prepare('SELECT id FROM nodes WHERE repository_id = ? AND file_path = ?')
      .all(repositoryId, filePath) as { id: number }[];
    if (nodeRows.length === 0) return [];

    const nodeIds = new Set(nodeRows.map((r) => r.id));

    const crossingEdges = this.db
      .prepare(
        `SELECT e.source_node_id, e.target_node_id, e.type,
                sn.stable_id AS source_stable_id, sn.file_path AS source_file_path,
                tn.stable_id AS target_stable_id, tn.file_path AS target_file_path
         FROM edges e
         JOIN nodes sn ON sn.id = e.source_node_id
         JOIN nodes tn ON tn.id = e.target_node_id
         WHERE e.repository_id = ? AND (sn.file_path = ? OR tn.file_path = ?)`,
      )
      .all(repositoryId, filePath, filePath) as {
      source_node_id: number;
      target_node_id: number;
      type: GraphEdgeType;
      source_stable_id: string;
      source_file_path: string | null;
      target_stable_id: string;
      target_file_path: string | null;
    }[];

    const dangling: DanglingReference[] = [];
    for (const edge of crossingEdges) {
      const sourceInFile = nodeIds.has(edge.source_node_id);
      const targetInFile = nodeIds.has(edge.target_node_id);
      if (sourceInFile === targetInFile) continue; // both or neither in the deleted file — not a cross-boundary edge
      dangling.push({
        sourceStableId: edge.source_stable_id,
        targetStableId: edge.target_stable_id,
        edgeType: edge.type,
      });
    }

    this.db
      .prepare('DELETE FROM nodes WHERE repository_id = ? AND file_path = ?')
      .run(repositoryId, filePath);

    return dangling;
  }

  // ---------------------------------------------------------------------
  // Edges
  // ---------------------------------------------------------------------

  /**
   * Returns the new edge's id, or `null` if either endpoint's stable id
   * isn't a known node — callers collect these as unresolved references
   * rather than the store silently dropping or throwing on them.
   */
  upsertEdge(repositoryId: number, edge: NewGraphEdge): number | null {
    const source = this.getNodeByStableId(repositoryId, edge.sourceStableId);
    const target = this.getNodeByStableId(repositoryId, edge.targetStableId);
    if (!source || !target) return null;

    const now = new Date().toISOString();
    const row = this.db
      .prepare(
        `INSERT INTO edges
           (repository_id, source_node_id, target_node_id, type, evidence_type, evidence_location_json, certainty, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (repository_id, source_node_id, target_node_id, type, evidence_type)
         DO UPDATE SET certainty = excluded.certainty,
                       evidence_location_json = excluded.evidence_location_json,
                       metadata_json = excluded.metadata_json,
                       updated_at = excluded.updated_at
         RETURNING id`,
      )
      .get(
        repositoryId,
        source.id,
        target.id,
        edge.type,
        edge.evidenceType,
        edge.evidenceLocation ? JSON.stringify(edge.evidenceLocation) : null,
        edge.certainty,
        edge.metadata ? JSON.stringify(edge.metadata) : null,
        now,
        now,
      ) as { id: number };
    return row.id;
  }

  listOutgoingEdges(nodeId: number, type?: GraphEdgeType): GraphEdge[] {
    const rows = type
      ? this.db
          .prepare('SELECT * FROM edges WHERE source_node_id = ? AND type = ?')
          .all(nodeId, type)
      : this.db.prepare('SELECT * FROM edges WHERE source_node_id = ?').all(nodeId);
    return rows.map((row) => mapEdgeRow(row as never));
  }

  listIncomingEdges(nodeId: number, type?: GraphEdgeType): GraphEdge[] {
    const rows = type
      ? this.db
          .prepare('SELECT * FROM edges WHERE target_node_id = ? AND type = ?')
          .all(nodeId, type)
      : this.db.prepare('SELECT * FROM edges WHERE target_node_id = ?').all(nodeId);
    return rows.map((row) => mapEdgeRow(row as never));
  }

  countEdges(repositoryId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM edges WHERE repository_id = ?')
      .get(repositoryId) as { count: number };
    return row.count;
  }

  /** Bulk edge listing for the graph API, optionally filtered by type and capped by `limit`. */
  listEdges(repositoryId: number, options: ListEdgesOptions = {}): GraphEdge[] {
    const params: unknown[] = [repositoryId];
    let sql = 'SELECT * FROM edges WHERE repository_id = ?';

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => '?').join(', ')})`;
      params.push(...options.types);
    }
    sql += ' ORDER BY id';
    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...(params as never[]));
    return rows.map((row) => mapEdgeRow(row as never));
  }

  countEdgesByType(repositoryId: number): Partial<Record<GraphEdgeType, number>> {
    const rows = this.db
      .prepare('SELECT type, COUNT(*) AS count FROM edges WHERE repository_id = ? GROUP BY type')
      .all(repositoryId) as { type: GraphEdgeType; count: number }[];
    return Object.fromEntries(rows.map((row) => [row.type, row.count]));
  }

  countNodesByType(repositoryId: number): Partial<Record<GraphNodeType, number>> {
    const rows = this.db
      .prepare('SELECT type, COUNT(*) AS count FROM nodes WHERE repository_id = ? GROUP BY type')
      .all(repositoryId) as { type: GraphNodeType; count: number }[];
    return Object.fromEntries(rows.map((row) => [row.type, row.count]));
  }

  // ---------------------------------------------------------------------
  // Traversal
  // ---------------------------------------------------------------------

  traverse(startNodeId: number, options: TraverseOptions): TraverseStep[] {
    return traverse(this, startNodeId, options);
  }

  findPath(
    fromNodeId: number,
    toNodeId: number,
    options: Omit<TraverseOptions, 'direction'> & { direction?: TraverseOptions['direction'] },
  ): PathStep[] | null {
    return findPath(this, fromNodeId, toNodeId, options);
  }
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
