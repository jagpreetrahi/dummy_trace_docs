/**
 * Types for the documentation patch generator (Milestone 7).
 *
 * `DocumentationProvider` is the vendor-neutral seam: nothing outside
 * `packages/generator` should ever import an LLM SDK directly. A provider
 * is never the sole source of truth — it's only ever called for findings
 * the deterministic impact analyzer (Milestone 6) already flagged as
 * `REVIEW`, and even then it can decline via `NEEDS_MORE_INFORMATION`
 * rather than fabricate an answer (brief §G).
 */

import type { CodeSymbolKind } from './code-types.js';

export interface GeneratorContext {
  documentPath: string;
  sectionHeading: string | null;
  /** The section's current raw text — what the patch, if any, replaces. */
  originalSectionContent: string;
  relatedSymbolName: string;
  relatedSymbolKind: CodeSymbolKind;
  /** The symbol's own source text before the change, or `null` if unavailable. */
  codeBefore: string | null;
  /** The symbol's own source text after the change, or `null` if unavailable. */
  codeAfter: string | null;
  /** Carried over from the triggering `ImpactFinding`. */
  evidence: string;
  explanation: string;
}

export interface ProposedPatch {
  documentPath: string;
  sectionHeading: string | null;
  /** Exact original text this patch would replace — used later (Milestone 8) to detect a stale patch before applying it. */
  originalContent: string;
  proposedContent: string;
  explanation: string;
  evidence: string[];
  assumptions: string[];
}

/**
 * Three outcomes, not two — deliberately distinct:
 * - `PROPOSED`: a concrete patch.
 * - `NEEDS_MORE_INFORMATION`: a *semantic* judgment — the provider looked
 *   at the evidence and it wasn't enough to safely describe what changed.
 * - `PROVIDER_UNAVAILABLE`: a *technical* failure — network, auth,
 *   rate limit, or an unparseable response. Conflating this with
 *   "insufficient evidence" would hide a broken provider behind what
 *   looks like a considered answer (brief §18 rule 18: don't silently
 *   skip a failed stage).
 */
export type GenerationResult =
  | { status: 'PROPOSED'; patch: ProposedPatch }
  | { status: 'NEEDS_MORE_INFORMATION'; reason: string }
  | { status: 'PROVIDER_UNAVAILABLE'; reason: string };

export interface DocumentationProvider {
  name: string;
  generatePatch(context: GeneratorContext): Promise<GenerationResult>;
}
