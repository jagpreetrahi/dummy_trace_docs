/**
 * Types for the structured analysis report (Milestone 9).
 *
 * A `Report` distinguishes confirmed facts from inferred relationships by
 * construction, not just by convention: `fileChanges`/`symbolChanges` come
 * straight from git + static parsing (Milestones 2/5) — nothing here is
 * guessed. `findings` come from graph-based rules with an explicit
 * `certainty` label (Milestone 6) — evidence-backed, never asserted as
 * fact. `proposedPatches` (only present when generation was explicitly
 * requested) are LLM output, kept in their own section, never merged into
 * the confirmed-changes sections. `unresolved` is exactly what its name
 * says: things the system could not determine, surfaced rather than
 * silently dropped (brief §I: "unresolved questions").
 */

import type { FileChange, SymbolChange } from './change-types.js';
import type { GenerationResult } from './generator-types.js';
import type { ImpactAction, ImpactFinding } from './impact-types.js';
import type { Certainty } from './graph-types.js';
import type { ValidationResult } from './validator-types.js';

export interface ReportProposedPatchEntry {
  finding: ImpactFinding;
  result: GenerationResult;
  /** Present only when `result.status === 'PROPOSED'`. */
  validation?: ValidationResult;
}

export interface UnresolvedItems {
  imports: { filePath: string; specifier: string }[];
  annotations: { filePath: string; target: string; reason: string }[];
  danglingReferences: { sourceStableId: string; targetStableId: string; edgeType: string }[];
}

export interface ReportSummary {
  filesChanged: number;
  symbolsChanged: number;
  findingsByAction: Partial<Record<ImpactAction, number>>;
  findingsByCertainty: Partial<Record<Certainty, number>>;
}

export interface Report {
  repositoryRoot: string;
  baseRevision: string;
  targetRevision: string | null;
  generatedAt: string;
  fileChanges: FileChange[];
  symbolChanges: SymbolChange[];
  findings: ImpactFinding[];
  unresolved: UnresolvedItems;
  /** Empty when patch generation wasn't requested — never fabricated to fill the section. */
  proposedPatches: ReportProposedPatchEntry[];
  summary: ReportSummary;
}
