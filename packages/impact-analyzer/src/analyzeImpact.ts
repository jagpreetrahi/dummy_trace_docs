import type { ChangeSet, ImpactFinding } from '@tracedocs/core';
import type { DanglingReference, GraphStore } from '@tracedocs/graph';
import { buildFindingFromCandidate, buildFindingFromDangling } from './buildFindings.js';
import { traverseForDocs } from './traverseForDocs.js';

export interface AnalyzeImpactOptions {
  /** How many CONTAINS hops outward from a changed symbol to look for documentation. Default 2 (symbol → class → file). */
  maxDepth?: number;
}

function findingKey(finding: ImpactFinding): string {
  return `${finding.documentPath}\u0000${finding.sectionHeading ?? ''}\u0000${finding.relatedSymbolId}`;
}

/**
 * Determines which documentation may be affected by the changes in
 * `changeSet`, using only graph-based retrieval and deterministic rules
 * (brief §F: "do not make the LLM the sole source of truth" — there is no
 * LLM involved at all yet, this is the required deterministic baseline).
 *
 * **Precondition**: `store`/`repositoryId` must reflect the graph
 * *immediately after* indexing the transition from `changeSet.baseRevision`
 * to `changeSet.targetRevision`, and `danglingReferences` must be the
 * `DanglingReference[]` that specific indexing call returned. This is what
 * lets `removed`/`moved` symbols still be matched against documentation
 * that pointed at them — their own graph node is gone by the time this
 * runs, so `danglingReferences` (captured at the moment of deletion) is
 * the only surviving evidence. `modified` findings don't depend on this
 * precondition — they're looked up fresh against the current graph
 * regardless of its prior state. See `docs/architecture.md` for why.
 *
 * Returns no finding at all for a symbol with no discoverable
 * documentation relationship — that is the correct, silent "no action"
 * outcome (brief §F: "avoid creating a documentation update merely to
 * demonstrate AI functionality"), not a gap to fill in.
 */
export function analyzeImpact(
  changeSet: ChangeSet,
  store: GraphStore,
  repositoryId: number,
  danglingReferences: DanglingReference[],
  options: AnalyzeImpactOptions = {},
): ImpactFinding[] {
  const maxDepth = options.maxDepth ?? 2;
  const findings: ImpactFinding[] = [];
  const seen = new Set<string>();

  const record = (finding: ImpactFinding | null) => {
    if (!finding) return;
    const key = findingKey(finding);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const change of changeSet.symbolChanges) {
    if (change.changeType === 'added') {
      // Nothing could already document code that didn't exist before.
      continue;
    }

    if (change.changeType === 'modified') {
      const node = store.getNodeByStableId(repositoryId, change.symbolId);
      if (!node) continue; // defensive: `store` should already reflect the target revision
      for (const candidate of traverseForDocs(store, node.id, maxDepth)) {
        record(buildFindingFromCandidate(change, candidate, changeSet));
      }
      continue;
    }

    // removed or moved: the symbol's own node is gone from the target
    // graph, so evidence comes only from what was dangling when it was
    // deleted — see the precondition note above.
    const oldStableId = change.changeType === 'removed' ? change.symbolId : change.previousSymbolId;
    if (!oldStableId) continue;

    for (const dangling of danglingReferences) {
      if (dangling.edgeType !== 'DOCUMENTS' || dangling.sourceStableId !== oldStableId) continue;
      record(buildFindingFromDangling(change, dangling, store, repositoryId, changeSet));
    }
  }

  return findings;
}
