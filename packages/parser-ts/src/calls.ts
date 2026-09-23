import ts from 'typescript';
import type { WalkContext } from './context.js';
import { toLocation } from './location.js';

/**
 * Only records calls whose callee is a plain identifier or a chain of
 * property accesses on one (`foo()`, `a.b()`, `a.b.c()`). Anything more
 * dynamic (`arr[i]()`, optional chaining, immediately-invoked expressions)
 * is skipped rather than recorded as a guess — matches the "evidence over
 * invention" rule for what counts as a statically identifiable call.
 */
export function recordCallIfSimple(
  node: ts.CallExpression,
  ctx: WalkContext,
  currentCallableId: string | null,
): void {
  const callee = node.expression;
  if (!isSimpleCalleeExpression(callee)) return;

  ctx.calls.push({
    repoRelativePath: ctx.repoRelativePath,
    callerSymbolId: currentCallableId,
    calleeName: callee.getText(ctx.sourceFile),
    location: toLocation(node, ctx.sourceFile),
  });
}

function isSimpleCalleeExpression(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return true;
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(expr) && !expr.questionDotToken) {
    return isSimpleCalleeExpression(expr.expression);
  }
  return false;
}
