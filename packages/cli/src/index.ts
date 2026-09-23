#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { analyzeChanges } from '@tracedocs/change-analyzer';
import { GraphStore } from '@tracedocs/graph';
import { indexRepository } from '@tracedocs/indexer';
import { analyzeImpact } from '@tracedocs/impact-analyzer';
import { Command } from 'commander';

const program = new Command();

program.name('tracedocs').description('Documentation intelligence and synchronization system');

function graphDbPath(repoRoot: string): string {
  return join(repoRoot, '.tracedocs', 'graph.db');
}

async function openGraphStore(repoRoot: string): Promise<GraphStore> {
  await mkdir(join(repoRoot, '.tracedocs'), { recursive: true });
  return GraphStore.open(graphDbPath(repoRoot));
}

program
  .command('index')
  .description('Index a repository: scan, parse, and update the dependency graph')
  .argument('[path]', 'repository path', '.')
  .action(async (pathArg: string) => {
    const repoRoot = resolve(pathArg);
    const store = await openGraphStore(repoRoot);

    try {
      const result = await indexRepository(repoRoot, store);

      console.log(`Repository: ${repoRoot}`);
      console.log(`Revision:   ${result.revision ?? '(no commits yet)'}`);
      console.log(
        `Files: +${result.filesAdded} ~${result.filesModified} -${result.filesRemoved} (=${result.filesUnchanged} unchanged)`,
      );
      console.log(`Graph: ${result.totalNodes} nodes, ${result.totalEdges} edges`);

      if (result.unresolvedImports.length > 0) {
        console.log(`Unresolved imports (${result.unresolvedImports.length}):`);
        for (const u of result.unresolvedImports) console.log(`  ${u.filePath} -> ${u.specifier}`);
      }
      if (result.unresolvedAnnotations.length > 0) {
        console.log(`Unresolved annotations (${result.unresolvedAnnotations.length}):`);
        for (const u of result.unresolvedAnnotations) console.log(`  ${u.filePath}: ${u.target} (${u.reason})`);
      }
      if (result.danglingReferences.length > 0) {
        console.log(`Dangling references from this run's deletions (${result.danglingReferences.length}):`);
        for (const d of result.danglingReferences) {
          console.log(`  ${d.sourceStableId} --${d.edgeType}--> ${d.targetStableId} (target no longer exists)`);
        }
      }
    } finally {
      store.close();
    }
  });

program
  .command('graph')
  .description('Print a summary of the indexed dependency graph')
  .argument('[path]', 'repository path', '.')
  .action(async (pathArg: string) => {
    const repoRoot = resolve(pathArg);
    const store = await openGraphStore(repoRoot);

    try {
      const repositoryId = store.upsertRepository(repoRoot);

      console.log(`Repository: ${repoRoot}`);
      console.log(`Total nodes: ${store.countNodes(repositoryId)}`);
      for (const [type, count] of Object.entries(store.countNodesByType(repositoryId))) {
        console.log(`  ${type}: ${count}`);
      }

      console.log(`Total edges: ${store.countEdges(repositoryId)}`);
      for (const [type, count] of Object.entries(store.countEdgesByType(repositoryId))) {
        console.log(`  ${type}: ${count}`);
      }
    } finally {
      store.close();
    }
  });

program
  .command('analyze')
  .description('Analyze what changed between two git revisions (target defaults to the working tree)')
  .argument('[path]', 'repository path', '.')
  .requiredOption('--base <revision>', 'base revision to compare from')
  .option('--target <revision>', 'target revision to compare to (default: the working tree)')
  .action(async (pathArg: string, options: { base: string; target?: string }) => {
    const repoRoot = resolve(pathArg);
    const result = await analyzeChanges(repoRoot, options.base, options.target);

    console.log(`Repository: ${repoRoot}`);
    console.log(`Base:       ${result.baseRevision}`);
    console.log(`Target:     ${result.targetRevision ?? '(working tree)'}`);
    console.log(`Files changed: ${result.fileChanges.length}`);
    for (const file of result.fileChanges) {
      const label =
        file.changeType === 'renamed' ? `${file.previousPath} -> ${file.path}` : file.path;
      console.log(`  ${file.changeType.padEnd(8)} ${label}`);
    }

    if (result.symbolChanges.length > 0) {
      console.log(`Symbol changes: ${result.symbolChanges.length}`);
      for (const symbol of result.symbolChanges) {
        console.log(`  [${symbol.changeType}] ${symbol.description}`);
      }
    }
  });

program
  .command('impact')
  .description(
    'Show which documentation may be affected by changes since --base, compared to the current working tree. ' +
      'Indexes the repository as part of this command (transitioning the graph to the working tree state) — ' +
      'findings for deleted/moved symbols are most reliable when the repository was already indexed at --base ' +
      'beforehand, since that is what lets this command see what used to document them.',
  )
  .argument('[path]', 'repository path', '.')
  .requiredOption('--base <revision>', 'base revision to compare from')
  .action(async (pathArg: string, options: { base: string }) => {
    const repoRoot = resolve(pathArg);
    const changeSet = await analyzeChanges(repoRoot, options.base);
    const store = await openGraphStore(repoRoot);

    try {
      const indexResult = await indexRepository(repoRoot, store);
      const findings = analyzeImpact(changeSet, store, indexResult.repositoryId, indexResult.danglingReferences);

      console.log(`Repository: ${repoRoot}`);
      console.log(`Base:       ${changeSet.baseRevision}`);
      console.log(`Target:     (working tree)`);

      if (findings.length === 0) {
        console.log('No documentation impact found.');
        return;
      }

      console.log(`Documentation impact findings: ${findings.length}`);
      for (const finding of findings) {
        const location = finding.sectionHeading ?? '(whole page)';
        console.log(`\n[${finding.action}] ${finding.documentPath} — ${location}`);
        console.log(`  Certainty: ${finding.certainty}`);
        console.log(`  Related:   ${finding.relatedSymbolName} (${finding.relatedChangeType})`);
        console.log(`  Why:       ${finding.explanation}`);
        if (finding.graphPath.length > 0) {
          console.log(`  Path:      ${finding.graphPath.map((s) => s.nodeName).join(' -> ')}`);
        }
      }
    } finally {
      store.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
