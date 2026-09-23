/**
 * Shared domain types used across TraceDocs packages.
 *
 * Kept intentionally small in Milestone 1 — only what the repository
 * scanner needs. Graph node/edge types are added in Milestone 3.
 */

export type SupportedLanguage = 'typescript' | 'javascript' | 'markdown';

export interface ScannedFile {
  /** Path relative to the repository root, using forward slashes. */
  repoRelativePath: string;
  language: SupportedLanguage;
  /** SHA-256 hex digest of the file's current content. */
  contentHash: string;
  sizeBytes: number;
}

export interface RepositoryScanResult {
  repositoryRoot: string;
  /** Current git revision (HEAD commit SHA), or null if not a git repo / no commits yet. */
  revision: string | null;
  scannedAt: string;
  files: ScannedFile[];
}

export interface ManifestEntry {
  contentHash: string;
  language: SupportedLanguage;
}

/**
 * Persisted at `.tracedocs/manifest.json`. Lets a re-scan skip work for
 * files whose content hash has not changed since the last index.
 */
export interface Manifest {
  revision: string | null;
  updatedAt: string;
  files: Record<string, ManifestEntry>;
}

export interface FileChangeSummary {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: string[];
}
