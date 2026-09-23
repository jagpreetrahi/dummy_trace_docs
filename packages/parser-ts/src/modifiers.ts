import ts from 'typescript';

export function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const flags = ts.getCombinedModifierFlags(node as unknown as ts.Declaration);
  return (flags & ts.ModifierFlags.Export) !== 0;
}

export function hasDefaultModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const flags = ts.getCombinedModifierFlags(node as unknown as ts.Declaration);
  return (flags & ts.ModifierFlags.Default) !== 0;
}
