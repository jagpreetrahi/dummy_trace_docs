import type { SymbolChange } from '@tracedocs/core';
import { describeKind } from './describe.js';
import type { SymbolWithContext } from './symbolContext.js';

export interface MoveDetectionResult {
  moved: SymbolChange[];
  unmatchedRemoved: SymbolWithContext[];
  unmatchedAdded: SymbolWithContext[];
}

/**
 * Reconciles removed and added symbol candidates gathered across every
 * changed file. A removed symbol and an added symbol are treated as one
 * "moved" symbol only when the kind, qualified name, *and* the exact
 * source text all match in different files — that's real evidence the
 * same code relocated, not a guess based on the name alone (a same-named
 * function with different content is a coincidence, not a move).
 */
export function detectMoves(
  removed: SymbolWithContext[],
  added: SymbolWithContext[],
): MoveDetectionResult {
  const usedAddedIndexes = new Set<number>();
  const moved: SymbolChange[] = [];
  const unmatchedRemoved: SymbolWithContext[] = [];

  for (const removedSymbol of removed) {
    const matchIndex = added.findIndex(
      (addedSymbol, index) =>
        !usedAddedIndexes.has(index) &&
        addedSymbol.filePath !== removedSymbol.filePath &&
        addedSymbol.symbol.kind === removedSymbol.symbol.kind &&
        addedSymbol.symbol.qualifiedName === removedSymbol.symbol.qualifiedName &&
        addedSymbol.textHash === removedSymbol.textHash,
    );

    if (matchIndex === -1) {
      unmatchedRemoved.push(removedSymbol);
      continue;
    }

    usedAddedIndexes.add(matchIndex);
    const target = added[matchIndex]!;
    moved.push({
      changeType: 'moved',
      symbolId: target.symbol.id,
      name: target.symbol.name,
      kind: target.symbol.kind,
      filePath: target.filePath,
      previousFilePath: removedSymbol.filePath,
      previousSymbolId: removedSymbol.symbol.id,
      location: target.symbol.location,
      description: `${describeKind(target.symbol.kind)} \`${target.symbol.qualifiedName}\` moved from ${removedSymbol.filePath} to ${target.filePath}`,
      evidence: 'Identical source text was removed from one file and added, unchanged, to another.',
    });
  }

  const unmatchedAdded = added.filter((_, index) => !usedAddedIndexes.has(index));
  return { moved, unmatchedRemoved, unmatchedAdded };
}
