import type { ChangeSet, FileChange, SymbolChange } from '@tracedocs/core';
import { detectLanguage } from '@tracedocs/scanner';
import { describeKind } from './describe.js';
import { diffFileSymbols } from './diffFileSymbols.js';
import { detectMoves } from './detectMoves.js';
import { getChangedFiles, readFileAtRevision, readTargetContent, resolveRevision } from './gitDiff.js';
import type { SymbolWithContext } from './symbolContext.js';

/**
 * Analyzes what changed between `baseRevision` and `targetRevision` (or
 * the current working tree, when `targetRevision` is omitted): which
 * files changed, and — for JS/TS files — which symbols were added,
 * removed, modified, or moved to another file. Purely git + parser based;
 * it does not touch the persistent graph (that's the impact analyzer's
 * job, Milestone 6, which consumes this output).
 */
export async function analyzeChanges(
  repoRoot: string,
  baseRevision: string,
  targetRevision?: string,
): Promise<ChangeSet> {
  const rawDiffs = await getChangedFiles(repoRoot, baseRevision, targetRevision);

  const fileChanges: FileChange[] = rawDiffs.map((diff) => ({
    changeType: diff.status,
    path: diff.path,
    ...(diff.previousPath ? { previousPath: diff.previousPath } : {}),
    language: detectLanguage(diff.path),
  }));

  const modifiedSymbolChanges: SymbolChange[] = [];
  const removedCandidates: SymbolWithContext[] = [];
  const addedCandidates: SymbolWithContext[] = [];

  for (const diff of rawDiffs) {
    const language = detectLanguage(diff.path);
    if (language !== 'typescript' && language !== 'javascript') continue;

    const oldPath = diff.previousPath ?? diff.path;
    const oldContent =
      diff.status === 'added' ? null : await readFileAtRevision(repoRoot, baseRevision, oldPath);
    const newContent =
      diff.status === 'deleted' ? null : await readTargetContent(repoRoot, targetRevision, diff.path);

    const fileDiff = diffFileSymbols(oldPath, oldContent, diff.path, newContent);
    modifiedSymbolChanges.push(...fileDiff.modified);
    removedCandidates.push(...fileDiff.removed);
    addedCandidates.push(...fileDiff.added);
  }

  const { moved, unmatchedRemoved, unmatchedAdded } = detectMoves(removedCandidates, addedCandidates);

  const removedChanges: SymbolChange[] = unmatchedRemoved.map((removed) => ({
    changeType: 'removed',
    symbolId: removed.symbol.id,
    name: removed.symbol.name,
    kind: removed.symbol.kind,
    filePath: removed.filePath,
    location: removed.symbol.location,
    description: `${describeKind(removed.symbol.kind)} \`${removed.symbol.qualifiedName}\` removed from ${removed.filePath}`,
    evidence: 'Symbol is present in the base revision and absent in the target.',
  }));

  const addedChanges: SymbolChange[] = unmatchedAdded.map((added) => ({
    changeType: 'added',
    symbolId: added.symbol.id,
    name: added.symbol.name,
    kind: added.symbol.kind,
    filePath: added.filePath,
    location: added.symbol.location,
    description: `${describeKind(added.symbol.kind)} \`${added.symbol.qualifiedName}\` added in ${added.filePath}`,
    evidence: 'Symbol is absent in the base revision and present in the target.',
  }));

  const [resolvedBase, resolvedTarget] = await Promise.all([
    resolveRevision(repoRoot, baseRevision),
    targetRevision ? resolveRevision(repoRoot, targetRevision) : Promise.resolve(null),
  ]);

  return {
    repositoryRoot: repoRoot,
    baseRevision: resolvedBase,
    targetRevision: resolvedTarget,
    fileChanges,
    symbolChanges: [...addedChanges, ...removedChanges, ...modifiedSymbolChanges, ...moved],
  };
}
