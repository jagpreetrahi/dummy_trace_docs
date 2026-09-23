import type { Certainty, ChangeSet, ImpactAction } from '@tracedocs/core';

/**
 * How certainty is assigned (documented per the brief's explicit
 * requirement, §F): purely by graph distance between the changed symbol
 * and the documentation. `HIGH` — the changed symbol itself is directly
 * documented (a maintainer-written annotation, depth 0). `MEDIUM` — a
 * direct container of the symbol (its class, typically) is documented
 * instead (depth 1). `LOW` — a container two hops up (typically the file)
 * is documented (depth 2). These are ranked labels reflecting how
 * directly the evidence connects the change to the documentation, not
 * calibrated probabilities — no claim is made about e.g. "70% likely to
 * be stale."
 */
export function certaintyForDepth(depth: number): Certainty {
  if (depth <= 0) return 'HIGH';
  if (depth === 1) return 'MEDIUM';
  return 'LOW';
}

/**
 * A finding is downgraded from `REVIEW` to `NEEDS_MORE_INFORMATION` when
 * the documentation file itself was *also* changed in the same diff —
 * that's a concrete signal the author may have already updated it, and a
 * confident "please review" would be redundant noise if so. It's not
 * dropped entirely, since we don't actually know whether the edit
 * addressed this specific relationship.
 */
export function classifyAction(documentPath: string, changeSet: ChangeSet): ImpactAction {
  const documentAlsoChanged = changeSet.fileChanges.some(
    (change) => change.path === documentPath || change.previousPath === documentPath,
  );
  return documentAlsoChanged ? 'NEEDS_MORE_INFORMATION' : 'REVIEW';
}
