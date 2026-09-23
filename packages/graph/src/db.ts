import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations.js';

/**
 * Opens (creating if necessary) the SQLite database at `path`, or an
 * in-memory database when `path` is `:memory:` (used by tests). Enables
 * foreign key enforcement — required for `ON DELETE CASCADE` to actually
 * cascade — and applies any migrations that haven't run yet.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
