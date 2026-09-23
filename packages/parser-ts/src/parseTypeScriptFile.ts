import ts from 'typescript';
import type { ParsedSourceFile } from '@tracedocs/core';
import type { WalkContext } from './context.js';
import { walkStatements } from './walker.js';

function scriptKindFor(repoRelativePath: string): ts.ScriptKind {
  if (repoRelativePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (repoRelativePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(ts|mts|cts)$/.test(repoRelativePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function languageFor(repoRelativePath: string): 'typescript' | 'javascript' {
  return /\.(ts|tsx|mts|cts)$/.test(repoRelativePath) ? 'typescript' : 'javascript';
}

/**
 * Parses one JS/TS file's source text into structural evidence: symbols,
 * imports, exports, statically identifiable calls, and JSDoc. Purely
 * syntactic — no type checker, no cross-file resolution. See
 * `docs/architecture.md` for why the TypeScript Compiler API was chosen
 * over tree-sitter.
 */
export function parseTypeScriptFile(
  repoRelativePath: string,
  sourceText: string,
): ParsedSourceFile {
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(repoRelativePath),
  );

  const ctx: WalkContext = {
    sourceFile,
    repoRelativePath,
    symbols: [],
    imports: [],
    exports: [],
    calls: [],
    unsupportedConstructs: [],
  };

  walkStatements(sourceFile.statements, ctx, null, null);

  return {
    repoRelativePath,
    language: languageFor(repoRelativePath),
    symbols: ctx.symbols,
    imports: ctx.imports,
    exports: ctx.exports,
    calls: ctx.calls,
    unsupportedConstructs: ctx.unsupportedConstructs,
  };
}
