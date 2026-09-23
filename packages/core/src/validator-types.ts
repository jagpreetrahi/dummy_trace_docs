/**
 * Types for the documentation validator (Milestone 8).
 *
 * A `ValidationResult` is never proof the prose is factually correct —
 * only that the proposed content is structurally sound (parses, its
 * annotations are well-formed, it still applies cleanly against the
 * current document) and hasn't tripped a content-quality heuristic worth
 * a human's attention (brief §H: "a successful Markdown validation must
 * not be described as proof that every factual statement is correct").
 */

export type ValidationCheck =
  | 'document-readable'
  | 'path-safety'
  | 'markdown-parse'
  | 'annotation-well-formed'
  | 'code-fence-integrity'
  | 'broken-link'
  | 'invalid-anchor'
  | 'patch-applicability'
  | 'accidental-deletion'
  | 'annotation-target-resolution';

/**
 * `error` blocks applying the patch; `warning` is a content-quality
 * signal surfaced for human judgment but never blocks on its own.
 */
export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  check: ValidationCheck;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationResult {
  /** True only when there are no `error`-severity issues. */
  valid: boolean;
  issues: ValidationIssue[];
  /** Checks skipped because their required input wasn't available (e.g. no graph store passed in) — never silently omitted. */
  checksNotPerformed: ValidationCheck[];
}
