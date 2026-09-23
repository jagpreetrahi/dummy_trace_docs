/**
 * Types produced by language parsers (Milestone 2).
 *
 * A parser's output is purely syntactic evidence about one file — it does
 * not resolve imports across files or decide what belongs in the
 * dependency graph. That resolution happens in the graph builder
 * (Milestone 3), which is what lets a new parser (Python, Go, ...) plug in
 * without the graph engine changing.
 */

export interface SourceLocation {
  /** 1-based line/column. Lines move between commits — never treat these as stable identifiers. */
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface JSDocTag {
  tag: string;
  text: string;
}

export interface JSDocInfo {
  description?: string;
  tags: JSDocTag[];
}

export type CodeSymbolKind = 'file' | 'class' | 'function' | 'method';

export interface CodeSymbol {
  /** Stable within one indexing run: `${repoRelativePath}#${qualifiedName}:${kind}`. */
  id: string;
  kind: CodeSymbolKind;
  name: string;
  /** Dotted path within the file, e.g. `AuthenticationService.refresh`. Equals `name` for top-level symbols. */
  qualifiedName: string;
  repoRelativePath: string;
  location: SourceLocation;
  exported: boolean;
  isDefaultExport: boolean;
  jsDoc?: JSDocInfo;
  /** Id of the enclosing class symbol, for methods. */
  parentId?: string;
}

export interface NamedImport {
  imported: string;
  local: string;
}

export interface ImportDeclarationInfo {
  repoRelativePath: string;
  /** Module text exactly as written, e.g. `./token` or `node:fs`. Unresolved — resolution happens in Milestone 3. */
  specifier: string;
  namedImports: NamedImport[];
  defaultImportLocal?: string;
  namespaceImportLocal?: string;
  isTypeOnly: boolean;
  location: SourceLocation;
}

export interface ExportDeclarationInfo {
  repoRelativePath: string;
  /** Name visible to importers; `"default"` for a default export. */
  exportedName: string;
  /** Local symbol name being exported, when this export refers to a symbol declared in this file. */
  localName?: string;
  /** Module specifier, for `export ... from '...'` re-exports. */
  reExportFrom?: string;
  location: SourceLocation;
}

export interface CallReferenceInfo {
  repoRelativePath: string;
  /** Id of the enclosing function/method symbol, or null for a module-level (top-level) call. */
  callerSymbolId: string | null;
  /** Source text of the callee expression, e.g. `refreshAccessToken` or `authService.refresh`. Unresolved text, not a symbol id. */
  calleeName: string;
  location: SourceLocation;
}

export interface UnsupportedConstruct {
  description: string;
  location: SourceLocation;
}

export interface ParsedSourceFile {
  repoRelativePath: string;
  language: 'typescript' | 'javascript';
  symbols: CodeSymbol[];
  imports: ImportDeclarationInfo[];
  exports: ExportDeclarationInfo[];
  calls: CallReferenceInfo[];
  /** Syntax this parser intentionally does not model (e.g. destructured exports). Never silently dropped. */
  unsupportedConstructs: UnsupportedConstruct[];
}
