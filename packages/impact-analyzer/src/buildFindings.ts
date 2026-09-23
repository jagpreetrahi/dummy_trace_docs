import type { ChangeSet, GraphNode, ImpactFinding, SymbolChange } from '@tracedocs/core';
import type { DanglingReference, GraphStore } from '@tracedocs/graph';
import { certaintyForDepth, classifyAction } from './classify.js';
import { describeNodeType } from './describeNodeType.js';
import type { DocCandidate } from './traverseForDocs.js';

function docNodeLocation(docNode: GraphNode): ImpactFinding['sectionLocation'] {
  if (docNode.startLine == null) return null;
  return { startLine: docNode.startLine, endLine: docNode.endLine ?? docNode.startLine };
}

function docNodeIdentity(docNode: GraphNode): { documentPath: string; sectionHeading: string | null } {
  return {
    documentPath: docNode.filePath ?? docNode.name,
    sectionHeading: docNode.type === 'documentation_section' ? docNode.name : null,
  };
}

/** A candidate found by walking the live graph from a `modified` symbol. */
export function buildFindingFromCandidate(change: SymbolChange, candidate: DocCandidate, changeSet: ChangeSet): ImpactFinding {
  const { documentPath, sectionHeading } = docNodeIdentity(candidate.docNode);
  const certainty = certaintyForDepth(candidate.depth);

  const evidence =
    candidate.depth === 0
      ? 'This symbol is explicitly documented in this section.'
      : `Its containing ${describeNodeType(candidate.path[1]!.type)} (\`${candidate.path[1]!.name}\`) is documented in this section.`;

  return {
    documentPath,
    sectionHeading,
    sectionLocation: docNodeLocation(candidate.docNode),
    relatedSymbolId: change.symbolId,
    relatedSymbolName: change.name,
    relatedChangeType: change.changeType,
    graphPath: candidate.path.map((node) => ({
      nodeStableId: node.stableId,
      nodeName: node.name,
      nodeType: node.type,
    })),
    evidence,
    certainty,
    action: classifyAction(documentPath, changeSet),
    explanation: `\`${change.name}\` (${change.kind}) was modified in ${change.filePath}. ${evidence}`,
  };
}

/**
 * A finding built from a dangling reference produced while re-indexing —
 * the removed/moved symbol's own node is gone, so there's no live path to
 * walk; the dangling edge itself (captured at the moment its source node
 * was deleted) is the only, but sufficient, evidence.
 */
export function buildFindingFromDangling(
  change: SymbolChange,
  dangling: DanglingReference,
  store: GraphStore,
  repositoryId: number,
  changeSet: ChangeSet,
): ImpactFinding | null {
  const docNode = store.getNodeByStableId(repositoryId, dangling.targetStableId);
  if (!docNode) return null; // the doc node itself is also gone — nothing to point at

  const { documentPath, sectionHeading } = docNodeIdentity(docNode);

  const evidence =
    change.changeType === 'removed'
      ? `The symbol \`${change.name}\` this section documented no longer exists — it was removed from ${change.filePath}.`
      : `The symbol \`${change.name}\` this section documented moved from ${change.previousFilePath} to ${change.filePath}.`;

  return {
    documentPath,
    sectionHeading,
    sectionLocation: docNodeLocation(docNode),
    relatedSymbolId: change.symbolId,
    relatedSymbolName: change.name,
    relatedChangeType: change.changeType,
    // No live path to walk — the symbol's node (and everything it used to
    // contain/be contained by) was already deleted by the time this runs.
    graphPath: [],
    evidence,
    certainty: 'HIGH',
    action: classifyAction(documentPath, changeSet),
    explanation: evidence,
  };
}
