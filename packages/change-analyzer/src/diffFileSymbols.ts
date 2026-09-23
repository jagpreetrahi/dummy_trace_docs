import type { CodeSymbol, SymbolChange } from '@tracedocs/core';
import { parseTypeScriptFile } from '@tracedocs/parser-ts';
import { describeKind } from './describe.js';
import type { SymbolWithContext } from './symbolContext.js';
import { hashText, sliceLines } from './textDiff.js';

export interface FileSymbolDiff {
  modified: SymbolChange[];
  removed: SymbolWithContext[];
  added: SymbolWithContext[];
}

function symbolKey(symbol: CodeSymbol): string {
  return `${symbol.kind}\u0000${symbol.qualifiedName}`;
}

/**
 * Diffs one file's symbols between two content snapshots, matched by kind
 * + qualified name (never by line number — lines shift). A matched pair is
 * "modified" only if its own source range's text actually differs; a
 * symbol present only on one side is a removal/addition candidate, left
 * for the caller to reconcile against candidates from *other* files
 * (a symbol removed here and added elsewhere, with identical text, is a
 * move — see `detectMoves`).
 */
export function diffFileSymbols(
  oldPath: string,
  oldContent: string | null,
  newPath: string,
  newContent: string | null,
): FileSymbolDiff {
  const oldSymbols = oldContent ? parseTypeScriptFile(oldPath, oldContent).symbols : [];
  const newSymbols = newContent ? parseTypeScriptFile(newPath, newContent).symbols : [];

  const oldByKey = new Map(oldSymbols.map((s) => [symbolKey(s), s]));
  const newByKey = new Map(newSymbols.map((s) => [symbolKey(s), s]));

  const modified: SymbolChange[] = [];
  const added: SymbolWithContext[] = [];
  const removed: SymbolWithContext[] = [];

  for (const [key, newSymbol] of newByKey) {
    const oldSymbol = oldByKey.get(key);
    if (!oldSymbol) {
      added.push({
        symbol: newSymbol,
        filePath: newPath,
        textHash: hashText(sliceLines(newContent!, newSymbol.location)),
      });
      continue;
    }

    const oldText = sliceLines(oldContent!, oldSymbol.location);
    const newText = sliceLines(newContent!, newSymbol.location);
    if (hashText(oldText) !== hashText(newText)) {
      modified.push({
        changeType: 'modified',
        symbolId: newSymbol.id,
        name: newSymbol.name,
        kind: newSymbol.kind,
        filePath: newPath,
        location: newSymbol.location,
        description: `${describeKind(newSymbol.kind)} \`${newSymbol.qualifiedName}\` changed in ${newPath}`,
        evidence: "This symbol's own source text differs between the two revisions.",
      });
    }
  }

  for (const [key, oldSymbol] of oldByKey) {
    if (newByKey.has(key)) continue;
    removed.push({
      symbol: oldSymbol,
      filePath: oldPath,
      textHash: hashText(sliceLines(oldContent!, oldSymbol.location)),
    });
  }

  return { modified, added, removed };
}
