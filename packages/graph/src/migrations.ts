import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  name: string;
  sql: string;
}

/**
 * Schema per the project brief §7, narrowed to what's actually populated
 * so far: `analysis_runs`, `impact_findings`, and `proposed_patches` exist
 * now so later migrations only ever *add* columns/indexes to them rather
 * than creating the table for the first time mid-project, but no code
 * writes to them until Milestones 5–8.
 *
 * `nodes.stable_id` is the parser/indexer-produced identifier (e.g.
 * `src/auth/token.ts#refreshAccessToken:function`); `nodes.id` is a plain
 * surrogate key used for fast integer foreign keys. Never confuse the two:
 * `stable_id` is what's stable across indexing runs, `id` is not.
 */
const MIGRATIONS: Migration[] = [
  {
    name: '0001_initial',
    sql: `
      CREATE TABLE repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_root TEXT NOT NULL UNIQUE,
        current_revision TEXT,
        indexed_at TEXT
      );

      CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        last_indexed_at TEXT NOT NULL,
        UNIQUE (repository_id, path)
      );

      CREATE TABLE nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        stable_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT,
        file_path TEXT,
        start_line INTEGER,
        end_line INTEGER,
        content_hash TEXT,
        metadata_json TEXT,
        UNIQUE (repository_id, stable_id)
      );
      CREATE INDEX idx_nodes_repo_type ON nodes(repository_id, type);
      CREATE INDEX idx_nodes_repo_file_path ON nodes(repository_id, file_path);

      CREATE TABLE edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        source_node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        evidence_location_json TEXT,
        certainty TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (repository_id, source_node_id, target_node_id, type, evidence_type)
      );
      CREATE INDEX idx_edges_source ON edges(source_node_id);
      CREATE INDEX idx_edges_target ON edges(target_node_id);
      CREATE INDEX idx_edges_repo_type ON edges(repository_id, type);

      CREATE TABLE analysis_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        base_revision TEXT,
        target_revision TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE impact_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        certainty TEXT NOT NULL,
        explanation TEXT,
        evidence_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE proposed_patches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        document_path TEXT NOT NULL,
        patch_content TEXT NOT NULL,
        validation_status TEXT,
        created_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec('BEGIN;');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }
}
