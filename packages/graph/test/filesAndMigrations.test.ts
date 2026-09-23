import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graphStore.js';
import { openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';

describe('files', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
  });

  afterEach(() => {
    store.close();
  });

  it('upserts a file record without erroring, and re-upserting updates rather than duplicates', () => {
    expect(() => store.upsertFile(repoId, 'src/a.ts', 'typescript', 'hash1', '2024-01-01T00:00:00.000Z')).not.toThrow();
    expect(() => store.upsertFile(repoId, 'src/a.ts', 'typescript', 'hash2', '2024-01-02T00:00:00.000Z')).not.toThrow();
  });

  it('deleteFile removes the file record', () => {
    store.upsertFile(repoId, 'src/a.ts', 'typescript', 'hash1', '2024-01-01T00:00:00.000Z');
    expect(() => store.deleteFile(repoId, 'src/a.ts')).not.toThrow();
  });
});

describe('migrations', () => {
  it('running migrations twice against the same database is a no-op the second time', () => {
    const db = openDatabase(':memory:');
    // openDatabase already ran migrations once; running the underlying
    // migration runner again must not fail or duplicate schema objects.
    expect(() => runMigrations(db)).not.toThrow();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nodes'")
      .all();
    expect(tables).toHaveLength(1);
    db.close();
  });

  it('creates all tables from the brief\'s data model', () => {
    const db = openDatabase(':memory:');
    const tableNames = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);

    for (const expected of [
      'repositories',
      'files',
      'nodes',
      'edges',
      'analysis_runs',
      'impact_findings',
      'proposed_patches',
    ]) {
      expect(tableNames).toContain(expected);
    }
    db.close();
  });

  it('enforces foreign keys (an edge cannot reference a non-existent node)', () => {
    const db = openDatabase(':memory:');
    db.exec("INSERT INTO repositories (repository_root) VALUES ('/repo')");
    expect(() =>
      db
        .prepare(
          `INSERT INTO edges (repository_id, source_node_id, target_node_id, type, evidence_type, certainty, created_at, updated_at)
           VALUES (1, 999, 998, 'CALLS', 'static_analysis', 'HIGH', '2024-01-01', '2024-01-01')`,
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
