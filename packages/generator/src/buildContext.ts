import type { ChangeSet, CodeSymbol, GeneratorContext, ImpactFinding } from '@tracedocs/core';
import { readFileAtRevision, readTargetContent, sliceLines } from '@tracedocs/change-analyzer';
import { parseTypeScriptFile } from '@tracedocs/parser-ts';

function findSymbolById(symbols: CodeSymbol[], id: string): CodeSymbol | undefined {
  return symbols.find((symbol) => symbol.id === id);
}

/** Like `sliceLines`, but for an `ImpactFinding.sectionLocation` — lines only, no column data. */
function sliceByLineRange(content: string, range: { startLine: number; endLine: number }): string {
  const lines = content.split('\n');
  return lines.slice(range.startLine - 1, range.endLine).join('\n');
}

/**
 * Assembles the bounded context a provider needs for one finding — never
 * the whole repository (brief §G: "avoid sending the entire repository to
 * the LLM"). Returns `null` when there isn't enough to work with (no
 * matching `modified` symbol change, or the doc file can no longer be
 * read) rather than handing the provider a context with holes in it.
 *
 * Only `modified` findings are supported. For `modified`, the old and new
 * stable id are identical (path/qualifiedName/kind didn't change — only
 * the body did), so the same id is used to look the symbol up in both the
 * base and target content. `removed`/`moved` findings aren't attempted —
 * "propose replacement text" is a much fuzzier problem when the symbol no
 * longer exists at all or exists somewhere else entirely; see
 * `docs/architecture.md` for why that's deliberately out of scope here.
 */
export async function buildGeneratorContext(
  finding: ImpactFinding,
  changeSet: ChangeSet,
): Promise<GeneratorContext | null> {
  const change = changeSet.symbolChanges.find(
    (candidate) => candidate.changeType === 'modified' && candidate.symbolId === finding.relatedSymbolId,
  );
  if (!change) return null;

  const oldContent = await readFileAtRevision(changeSet.repositoryRoot, changeSet.baseRevision, change.filePath);
  const newContent = await readTargetContent(
    changeSet.repositoryRoot,
    changeSet.targetRevision ?? undefined,
    change.filePath,
  );

  const oldSymbol = oldContent
    ? findSymbolById(parseTypeScriptFile(change.filePath, oldContent).symbols, change.symbolId)
    : undefined;
  const newSymbol = newContent
    ? findSymbolById(parseTypeScriptFile(change.filePath, newContent).symbols, change.symbolId)
    : undefined;

  const codeBefore = oldSymbol && oldContent ? sliceLines(oldContent, oldSymbol.location) : null;
  const codeAfter = newSymbol && newContent ? sliceLines(newContent, newSymbol.location) : null;

  const docContent = await readTargetContent(
    changeSet.repositoryRoot,
    changeSet.targetRevision ?? undefined,
    finding.documentPath,
  );
  if (docContent === null) return null;

  const originalSectionContent = finding.sectionLocation
    ? sliceByLineRange(docContent, finding.sectionLocation)
    : docContent;

  return {
    documentPath: finding.documentPath,
    sectionHeading: finding.sectionHeading,
    originalSectionContent,
    relatedSymbolName: finding.relatedSymbolName,
    relatedSymbolKind: change.kind,
    codeBefore,
    codeAfter,
    evidence: finding.evidence,
    explanation: finding.explanation,
  };
}
