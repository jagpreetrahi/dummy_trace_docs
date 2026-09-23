#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GraphStore } from '@tracedocs/graph';
import { indexRepository } from '@tracedocs/indexer';
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

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
