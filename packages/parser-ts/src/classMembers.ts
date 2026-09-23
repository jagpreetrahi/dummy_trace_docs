import ts from 'typescript';
import type { CodeSymbol } from '@tracedocs/core';
import type { ClassContext, WalkContext } from './context.js';
import { buildSymbolId } from './identifiers.js';
import { getJsDoc } from './jsdoc.js';
import { toLocation } from './location.js';
import type { visitNode } from './walker.js';

type WalkStatementsFn = (
  statements: readonly ts.Statement[],
  ctx: WalkContext,
  currentClass: ClassContext | null,
  currentCallableId: string | null,
) => void;

/**
 * Handles one class member. Only constructors, methods, accessors, and
 * arrow-function class fields (a common bound-method pattern) become
 * `method` symbols — plain data fields are out of scope for Milestone 2.
 */
export function visitClassMember(
  member: ts.ClassElement,
  ctx: WalkContext,
  classCtx: ClassContext,
  walkStatements: WalkStatementsFn,
  visitNodeFn: typeof visitNode,
): void {
  let name: string | undefined;
  let declNode: ts.Node = member;
  let body: ts.ConciseBody | undefined;

  if (ts.isConstructorDeclaration(member)) {
    name = 'constructor';
    body = member.body;
  } else if (
    ts.isMethodDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)
  ) {
    if (!ts.isIdentifier(member.name)) {
      ctx.unsupportedConstructs.push({
        description: 'Computed method name is not modeled',
        location: toLocation(member, ctx.sourceFile),
      });
      return;
    }
    name = member.name.text;
    body = member.body;
  } else if (
    ts.isPropertyDeclaration(member) &&
    ts.isIdentifier(member.name) &&
    member.initializer &&
    (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
  ) {
    name = member.name.text;
    declNode = member;
    body = member.initializer.body;
  } else {
    return;
  }

  const qualifiedName = `${classCtx.name}.${name}`;
  const jsDoc = getJsDoc(declNode, ctx.sourceFile);
  const symbol: CodeSymbol = {
    id: buildSymbolId(ctx.repoRelativePath, qualifiedName, 'method'),
    kind: 'method',
    name,
    qualifiedName,
    repoRelativePath: ctx.repoRelativePath,
    location: toLocation(declNode, ctx.sourceFile),
    exported: false,
    isDefaultExport: false,
    parentId: classCtx.id,
    ...(jsDoc ? { jsDoc } : {}),
  };
  ctx.symbols.push(symbol);

  if (!body) return; // abstract/overload signature — no body to walk
  if (ts.isBlock(body)) {
    walkStatements(body.statements, ctx, classCtx, symbol.id);
  } else {
    // concise arrow body, e.g. `handleClick = () => doThing()`
    visitNodeFn(body, ctx, classCtx, symbol.id);
  }
}
