import type { CodeSymbol } from '@tracedocs/core';

/** A symbol plus the file it was found in and a content hash of its own source range, for cross-file move matching. */
export interface SymbolWithContext {
  symbol: CodeSymbol;
  filePath: string;
  textHash: string;
}
