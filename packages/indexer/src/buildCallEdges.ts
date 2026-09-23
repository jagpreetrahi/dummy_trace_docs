import type { CodeSymbol, ParsedSourceFile } from '@tracedocs/core';
import type { GraphStore } from '@tracedocs/graph';

/**
 * Resolves statically identifiable calls to CALLS edges, but only within
 * the same file: a bare identifier matching a same-file function, or
 * `this.method()` matching a sibling method on the caller's own class.
 * Cross-file call resolution (following an import binding to another
 * file's export) is deferred — it needs import-aware name resolution that
 * would meaningfully expand this module's scope. See `docs/architecture.md`.
 */
export function buildCallEdges(store: GraphStore, repositoryId: number, parsed: ParsedSourceFile): void {
  const symbolById = new Map(parsed.symbols.map((s) => [s.id, s]));
  const functionIdByName = new Map(
    parsed.symbols.filter((s) => s.kind === 'function').map((s) => [s.name, s.id]),
  );
  const methodIdByQualifiedName = new Map(
    parsed.symbols.filter((s) => s.kind === 'method').map((s) => [s.qualifiedName, s.id]),
  );

  for (const call of parsed.calls) {
    if (!call.callerSymbolId) continue; // module-level call — no source symbol to attribute an edge to

    const targetStableId = resolveCallTarget(call, symbolById, functionIdByName, methodIdByQualifiedName);
    if (!targetStableId) continue;

    store.upsertEdge(repositoryId, {
      sourceStableId: call.callerSymbolId,
      targetStableId,
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
      evidenceLocation: {
        filePath: call.repoRelativePath,
        startLine: call.location.startLine,
        endLine: call.location.endLine,
      },
    });
  }
}

function resolveCallTarget(
  call: ParsedSourceFile['calls'][number],
  symbolById: Map<string, CodeSymbol>,
  functionIdByName: Map<string, string>,
  methodIdByQualifiedName: Map<string, string>,
): string | undefined {
  if (call.calleeName.startsWith('this.')) {
    const methodName = call.calleeName.slice('this.'.length);
    if (methodName.includes('.')) return undefined; // e.g. `this.store.save` — not a direct sibling method

    const caller = symbolById.get(call.callerSymbolId ?? '');
    if (!caller || caller.kind !== 'method') return undefined;

    const className = caller.qualifiedName.slice(0, caller.qualifiedName.lastIndexOf('.'));
    return methodIdByQualifiedName.get(`${className}.${methodName}`);
  }

  if (!call.calleeName.includes('.')) {
    return functionIdByName.get(call.calleeName);
  }

  return undefined; // any other dotted callee — imported namespace, external object, etc.
}
