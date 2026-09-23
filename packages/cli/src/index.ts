#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  diffAgainstManifest,
  loadManifest,
  saveManifest,
  scanRepository,
  toManifest,
} from '@tracedocs/scanner';
import { Command } from 'commander';

const program = new Command();

program.name('tracedocs').description('Documentation intelligence and synchronization system');

program
  .command('index')
  .description('Scan a repository for supported source and documentation files')
  .argument('[path]', 'repository path', '.')
  .action(async (pathArg: string) => {
    const repoRoot = resolve(pathArg);

    const previousManifest = await loadManifest(repoRoot);
    const scan = await scanRepository(repoRoot);
    const changes = diffAgainstManifest(scan, previousManifest);
    await saveManifest(repoRoot, toManifest(scan));

    console.log(`Repository: ${scan.repositoryRoot}`);
    console.log(`Revision:   ${scan.revision ?? '(no commits yet)'}`);
    console.log(`Files indexed: ${scan.files.length}`);
    console.log(
      `Changes since last index: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length} (=${changes.unchanged.length} unchanged)`,
    );

    for (const path of changes.added) console.log(`  added:    ${path}`);
    for (const path of changes.modified) console.log(`  modified: ${path}`);
    for (const path of changes.removed) console.log(`  removed:  ${path}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
