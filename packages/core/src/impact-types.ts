/**
 * Types produced by the documentation impact analyzer (Milestone 6).
 *
 * An `ImpactFinding` answers one question per changed symbol: "does this
 * specific documentation section look like it's about the thing that just
 * changed, and if so, how sure are we?" It is deliberately not a verdict
 * on whether the prose is *actually* wrong — that requires understanding
 * meaning, which is out of scope for graph-based rules and belongs to an
 * LLM-assisted step layered on top later (brief §F). Silence (no finding)
 * for a given symbol is the expected, correct output when no relationship
 * was found — it is not a bug to fix by inventing one.
 */

import type { SymbolChangeType } from './change-types.js';
import type { Certainty, GraphNodeType } from './graph-types.js';

/**
 * `PROPOSE_UPDATE` is reserved for once the generator (Milestone 7) can
 * actually accompany a finding with a concrete patch — Milestone 6 only
 * ever assigns the other three, since claiming "propose an update" with
 * nothing to propose would be dishonest. See `docs/architecture.md` for
 * the full rule set behind each label.
 */
export type ImpactAction = 'REVIEW' | 'NO_ACTION' | 'NEEDS_MORE_INFORMATION' | 'PROPOSE_UPDATE';

export interface ImpactPathStep {
  nodeStableId: string;
  nodeName: string;
  nodeType: GraphNodeType;
}

export interface ImpactFinding {
  documentPath: string;
  /** `null` when the relationship is to the page as a whole rather than one of its headed sections. */
  sectionHeading: string | null;
  /**
   * Line range only (graph nodes don't store column data — `GraphNode`
   * captures `startLine`/`endLine` for exactly this kind of "roughly
   * where" reporting, not precise-enough-to-patch coordinates).
   */
  sectionLocation: { startLine: number; endLine: number } | null;
  relatedSymbolId: string;
  relatedSymbolName: string;
  relatedChangeType: SymbolChangeType;
  /** The actual path found in the graph — never fabricated; empty only for the dangling-reference case, where the symbol's old graph context no longer exists to walk. */
  graphPath: ImpactPathStep[];
  evidence: string;
  certainty: Certainty;
  action: ImpactAction;
  explanation: string;
}
