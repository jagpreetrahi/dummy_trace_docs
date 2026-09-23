import ts from 'typescript';
import type { CodeSymbol, NamedImport } from '@tracedocs/core';
import type { WalkContext } from './context.js';
import { toLocation } from './location.js';

export function handleImportDeclaration(node: ts.ImportDeclaration, ctx: WalkContext): void {
  const specifier = ts.isStringLiteral(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : node.moduleSpecifier.getText(ctx.sourceFile);

  const clause = node.importClause;
  const namedImports: NamedImport[] = [];
  let defaultImportLocal: string | undefined;
  let namespaceImportLocal: string | undefined;

  if (clause) {
    if (clause.name) defaultImportLocal = clause.name.text;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceImportLocal = bindings.name.text;
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        namedImports.push({
          imported: (element.propertyName ?? element.name).text,
          local: element.name.text,
        });
      }
    }
  }

  ctx.imports.push({
    repoRelativePath: ctx.repoRelativePath,
    specifier,
    namedImports,
    ...(defaultImportLocal ? { defaultImportLocal } : {}),
    ...(namespaceImportLocal ? { namespaceImportLocal } : {}),
    isTypeOnly: clause?.isTypeOnly ?? false,
    location: toLocation(node, ctx.sourceFile),
  });
}

export function handleExportDeclaration(node: ts.ExportDeclaration, ctx: WalkContext): void {
  const reExportFrom =
    node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  const location = toLocation(node, ctx.sourceFile);

  if (!node.exportClause) {
    // `export * from './x'`
    ctx.exports.push({
      repoRelativePath: ctx.repoRelativePath,
      exportedName: '*',
      ...(reExportFrom ? { reExportFrom } : {}),
      location,
    });
    return;
  }

  if (ts.isNamespaceExport(node.exportClause)) {
    // `export * as ns from './x'`
    ctx.exports.push({
      repoRelativePath: ctx.repoRelativePath,
      exportedName: node.exportClause.name.text,
      ...(reExportFrom ? { reExportFrom } : {}),
      location,
    });
    return;
  }

  for (const element of node.exportClause.elements) {
    ctx.exports.push({
      repoRelativePath: ctx.repoRelativePath,
      exportedName: element.name.text,
      localName: (element.propertyName ?? element.name).text,
      ...(reExportFrom ? { reExportFrom } : {}),
      location,
    });
  }
}

export function handleExportAssignment(node: ts.ExportAssignment, ctx: WalkContext): void {
  const location = toLocation(node, ctx.sourceFile);

  if (node.isExportEquals) {
    ctx.unsupportedConstructs.push({
      description: 'CommonJS-style `export =` is not modeled',
      location,
    });
    return;
  }

  const localName = ts.isIdentifier(node.expression) ? node.expression.text : undefined;
  ctx.exports.push({
    repoRelativePath: ctx.repoRelativePath,
    exportedName: 'default',
    ...(localName ? { localName } : {}),
    location,
  });
}

/** Records the export-name mapping for a symbol declared with an inline `export` modifier. */
export function recordInlineExportIfExported(
  symbol: CodeSymbol,
  ctx: WalkContext,
  locationNode: ts.Node,
): void {
  if (!symbol.exported) return;
  ctx.exports.push({
    repoRelativePath: ctx.repoRelativePath,
    exportedName: symbol.isDefaultExport ? 'default' : symbol.name,
    localName: symbol.name,
    location: toLocation(locationNode, ctx.sourceFile),
  });
}
