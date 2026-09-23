import ts from 'typescript';
import type { CodeSymbol } from '@tracedocs/core';
import { recordCallIfSimple } from './calls.js';
import type { ClassContext, WalkContext } from './context.js';
import { visitClassMember } from './classMembers.js';
import { buildSymbolId } from './identifiers.js';
import {
  handleExportAssignment,
  handleExportDeclaration,
  handleImportDeclaration,
  recordInlineExportIfExported,
} from './imports-exports.js';
import { getJsDoc } from './jsdoc.js';
import { toLocation } from './location.js';
import { hasDefaultModifier, hasExportModifier } from './modifiers.js';

export function walkStatements(
  statements: readonly ts.Statement[],
  ctx: WalkContext,
  currentClass: ClassContext | null,
  currentCallableId: string | null,
): void {
  for (const statement of statements) {
    visitNode(statement, ctx, currentClass, currentCallableId);
  }
}

function walkFunctionLikeBody(
  body: ts.ConciseBody | undefined,
  ctx: WalkContext,
  currentClass: ClassContext | null,
  callableId: string,
): void {
  if (!body) return;
  if (ts.isBlock(body)) {
    walkStatements(body.statements, ctx, currentClass, callableId);
  } else {
    visitNode(body, ctx, currentClass, callableId);
  }
}

function findEnclosingVariableStatement(node: ts.VariableDeclaration): ts.VariableStatement | undefined {
  const list = node.parent;
  const statement = list.parent;
  return ts.isVariableStatement(statement) ? statement : undefined;
}

export function visitNode(
  node: ts.Node,
  ctx: WalkContext,
  currentClass: ClassContext | null,
  currentCallableId: string | null,
): void {
  if (ts.isImportDeclaration(node)) {
    handleImportDeclaration(node, ctx);
    return;
  }

  if (ts.isExportDeclaration(node)) {
    handleExportDeclaration(node, ctx);
    return;
  }

  if (ts.isExportAssignment(node)) {
    handleExportAssignment(node, ctx);
    return;
  }

  if (ts.isFunctionDeclaration(node)) {
    const isDefault = hasDefaultModifier(node);
    const name = node.name?.text ?? (isDefault ? 'default' : undefined);
    if (name) {
      const jsDoc = getJsDoc(node, ctx.sourceFile);
      const symbol: CodeSymbol = {
        id: buildSymbolId(ctx.repoRelativePath, name, 'function'),
        kind: 'function',
        name,
        qualifiedName: name,
        repoRelativePath: ctx.repoRelativePath,
        location: toLocation(node, ctx.sourceFile),
        exported: hasExportModifier(node),
        isDefaultExport: isDefault,
        ...(jsDoc ? { jsDoc } : {}),
      };
      ctx.symbols.push(symbol);
      recordInlineExportIfExported(symbol, ctx, node);
      walkFunctionLikeBody(node.body, ctx, currentClass, symbol.id);
      return;
    }
  }

  if (ts.isClassDeclaration(node) && node.name) {
    const qualifiedName = node.name.text;
    const jsDoc = getJsDoc(node, ctx.sourceFile);
    const symbol: CodeSymbol = {
      id: buildSymbolId(ctx.repoRelativePath, qualifiedName, 'class'),
      kind: 'class',
      name: qualifiedName,
      qualifiedName,
      repoRelativePath: ctx.repoRelativePath,
      location: toLocation(node, ctx.sourceFile),
      exported: hasExportModifier(node),
      isDefaultExport: hasDefaultModifier(node),
      ...(jsDoc ? { jsDoc } : {}),
    };
    ctx.symbols.push(symbol);
    recordInlineExportIfExported(symbol, ctx, node);

    const classCtx: ClassContext = { id: symbol.id, name: qualifiedName };
    for (const member of node.members) {
      visitClassMember(member, ctx, classCtx, walkStatements, visitNode);
    }
    return;
  }

  if (ts.isVariableDeclaration(node) && !ts.isIdentifier(node.name)) {
    const statement = findEnclosingVariableStatement(node);
    if (statement && hasExportModifier(statement)) {
      ctx.unsupportedConstructs.push({
        description: 'Destructured export binding is not modeled',
        location: toLocation(node, ctx.sourceFile),
      });
    }
    // Fall through to generic recursion below so calls in the initializer are still found.
  } else if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    const name = node.name.text;
    const statement = findEnclosingVariableStatement(node);
    const modifierNode: ts.Node = statement ?? node;
    const jsDoc = getJsDoc(modifierNode, ctx.sourceFile);
    const symbol: CodeSymbol = {
      id: buildSymbolId(ctx.repoRelativePath, name, 'function'),
      kind: 'function',
      name,
      qualifiedName: name,
      repoRelativePath: ctx.repoRelativePath,
      location: toLocation(modifierNode, ctx.sourceFile),
      exported: hasExportModifier(modifierNode),
      isDefaultExport: false,
      ...(jsDoc ? { jsDoc } : {}),
    };
    ctx.symbols.push(symbol);
    recordInlineExportIfExported(symbol, ctx, modifierNode);
    walkFunctionLikeBody(node.initializer.body, ctx, currentClass, symbol.id);
    return;
  }

  if (ts.isCallExpression(node)) {
    recordCallIfSimple(node, ctx, currentCallableId);
  }

  ts.forEachChild(node, (child) => {
    visitNode(child, ctx, currentClass, currentCallableId);
  });
}
