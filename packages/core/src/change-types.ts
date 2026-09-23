/**
 * Types produced by the change analyzer (Milestone 5).
 *
 * These describe *what changed between two git revisions* — they don't
 * judge whether documentation is affected (that's the impact analyzer,
 * Milestone 6) or resolve anything against the persistent graph. A
 * `ChangeSet` is meant to be a small, bounded, evidence-backed artifact:
 * exactly what's needed to construct an LLM prompt or an impact-analysis
 * query without re-sending whole files.
 */

import type { CodeSymbolKind, SourceLocation } from './code-types.js';
import type { SupportedLanguage } from './types.js';

export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  changeType: FileChangeType;
  /** Current/new path. For a deleted file, this is the path it had before deletion. */
  path: string;
  /** Previous path, present only for `renamed`. */
  previousPath?: string;
  /** `null` for files outside the supported set (still reported as changed, just not parsed). */
  language: SupportedLanguage | null;
}

export type SymbolChangeType = 'added' | 'removed' | 'modified' | 'moved';

export interface SymbolChange {
  changeType: SymbolChangeType;
  /** Stable id in whichever revision is most relevant: the new one for added/modified/moved, the old one for removed. */
  symbolId: string;
  name: string;
  kind: CodeSymbolKind;
  filePath: string;
  /** Present only for `moved`: the file this symbol used to live in. */
  previousFilePath?: string;
  /**
   * Present only for `moved`: the stable id it had before moving. Needed
   * because `symbolId` is the *new* id for a move — a consumer that wants
   * to look up what used to reference this symbol at its old location
   * (e.g. the impact analyzer, against dangling graph edges) needs the
   * old id specifically, not a `${previousFilePath}#...` string it would
   * otherwise have to reconstruct itself.
   */
  previousSymbolId?: string;
  /** Best-available location — absent only if the symbol no longer exists anywhere (removed). */
  location?: SourceLocation;
  description: string;
  evidence: string;
}

export interface ChangeSet {
  repositoryRoot: string;
  /** Resolved to a full commit SHA. */
  baseRevision: string;
  /** Resolved to a full commit SHA, or `null` meaning "the current working tree." */
  targetRevision: string | null;
  fileChanges: FileChange[];
  symbolChanges: SymbolChange[];
}
