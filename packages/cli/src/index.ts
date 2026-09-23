#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { analyzeChanges } from '@tracedocs/change-analyzer';
import { createAnthropicProvider, createMockProvider, generateDocumentationUpdates } from '@tracedocs/generator';
import { GraphStore } from '@tracedocs/graph';
import { indexRepository } from '@tracedocs/indexer';
import { analyzeImpact } from '@tracedocs/impact-analyzer';
import { buildReport, renderAnnotations, renderJson, renderMarkdown } from '@tracedocs/report';
import { applyPatch, validatePatch } from '@tracedocs/validator';
import { Command } from 'commander';
import type { ReportProposedPatchEntry } from '@tracedocs/core';

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

program
  .command('generate')
  .description(
    'Propose documentation patches for REVIEW-level findings on modified symbols since --base, validate each ' +
      'one, and optionally apply the valid ones to disk with --apply (requires --yes as explicit approval — ' +
      "nothing is ever written without it). Defaults to a fully offline mock provider — use --provider " +
      'anthropic for real generation (requires an Anthropic API key configured; see docs/architecture.md).',
  )
  .argument('[path]', 'repository path', '.')
  .requiredOption('--base <revision>', 'base revision to compare from')
  .option('--provider <name>', 'mock (default) or anthropic', 'mock')
  .option('--apply', 'write valid, non-stale patches to disk (requires --yes)', false)
  .option('--yes', 'explicit approval required to actually write anything with --apply', false)
  .action(async (pathArg: string, options: { base: string; provider: string; apply: boolean; yes: boolean }) => {
    if (options.provider !== 'mock' && options.provider !== 'anthropic') {
      throw new Error(`Unknown provider "${options.provider}" — expected "mock" or "anthropic".`);
    }
    if (options.apply && !options.yes) {
      throw new Error('--apply requires --yes as explicit confirmation that patches should be written to disk.');
    }

    const repoRoot = resolve(pathArg);
    const changeSet = await analyzeChanges(repoRoot, options.base);
    const store = await openGraphStore(repoRoot);

    try {
      const indexResult = await indexRepository(repoRoot, store);
      const findings = analyzeImpact(changeSet, store, indexResult.repositoryId, indexResult.danglingReferences);
      const provider = options.provider === 'anthropic' ? createAnthropicProvider() : createMockProvider();
      const outcomes = await generateDocumentationUpdates(findings, changeSet, provider);
      const validatorOptions = { store, repositoryId: indexResult.repositoryId };

      console.log(`Repository: ${repoRoot}`);
      console.log(`Provider:   ${provider.name}`);

      if (outcomes.length === 0) {
        console.log('No findings qualified for patch generation (see `tracedocs impact` for the full finding list).');
        return;
      }

      for (const { finding, result } of outcomes) {
        const location = finding.sectionHeading ?? '(whole page)';
        console.log(`\n${finding.documentPath} — ${location}`);

        if (result.status === 'NEEDS_MORE_INFORMATION') {
          console.log('  Status: NEEDS_MORE_INFORMATION');
          console.log(`  Reason: ${result.reason}`);
          continue;
        }
        if (result.status === 'PROVIDER_UNAVAILABLE') {
          console.log('  Status: PROVIDER_UNAVAILABLE');
          console.log(`  Reason: ${result.reason}`);
          continue;
        }

        console.log('  Status: PROPOSED');
        console.log(`  Explanation: ${result.patch.explanation}`);
        if (result.patch.assumptions.length > 0) {
          console.log(`  Assumptions: ${result.patch.assumptions.join('; ')}`);
        }
        console.log('  --- original ---');
        console.log(indent(result.patch.originalContent));
        console.log('  --- proposed ---');
        console.log(indent(result.patch.proposedContent));

        const validation = await validatePatch(result.patch, repoRoot, validatorOptions);
        printValidation(validation);

        if (!options.apply) continue;

        if (!validation.valid) {
          console.log('  Not applied: validation failed (see issues above).');
          continue;
        }

        const applyResult = await applyPatch(result.patch, repoRoot, validatorOptions);
        console.log(applyResult.applied ? '  Applied.' : '  Not applied: became invalid immediately before writing.');
      }
    } finally {
      store.close();
    }
  });

program
  .command('report')
  .description(
    'Generate a structured documentation-impact report for --base vs. --target (default: the working tree). ' +
      'CI-friendly: exits 0 whenever analysis completes, regardless of what it found — this is an advisory ' +
      'report, not a pass/fail gate. Patch generation is only included when --provider is given.',
  )
  .argument('[path]', 'repository path', '.')
  .requiredOption('--base <revision>', 'base revision to compare from')
  .option('--target <revision>', 'target revision to compare to (default: the working tree)')
  .option('--format <format>', 'markdown (default), json, or annotations (GitHub Actions workflow commands)', 'markdown')
  .option('--out <file>', 'write the report to a file instead of stdout')
  .option('--provider <name>', 'also generate and validate patches: mock or anthropic (omit to skip generation)')
  .action(
    async (
      pathArg: string,
      options: { base: string; target?: string; format: string; out?: string; provider?: string },
    ) => {
      if (!['markdown', 'json', 'annotations'].includes(options.format)) {
        throw new Error(`Unknown format "${options.format}" — expected "markdown", "json", or "annotations".`);
      }
      if (options.provider && options.provider !== 'mock' && options.provider !== 'anthropic') {
        throw new Error(`Unknown provider "${options.provider}" — expected "mock" or "anthropic".`);
      }

      const repoRoot = resolve(pathArg);
      const changeSet = await analyzeChanges(repoRoot, options.base, options.target);
      const store = await openGraphStore(repoRoot);

      try {
        const indexResult = await indexRepository(repoRoot, store);
        const findings = analyzeImpact(changeSet, store, indexResult.repositoryId, indexResult.danglingReferences);
        const validatorOptions = { store, repositoryId: indexResult.repositoryId };

        let proposedPatches: ReportProposedPatchEntry[] = [];
        if (options.provider) {
          const provider = options.provider === 'anthropic' ? createAnthropicProvider() : createMockProvider();
          const outcomes = await generateDocumentationUpdates(findings, changeSet, provider);
          proposedPatches = await Promise.all(
            outcomes.map(async ({ finding, result }): Promise<ReportProposedPatchEntry> => {
              if (result.status !== 'PROPOSED') return { finding, result };
              const validation = await validatePatch(result.patch, repoRoot, validatorOptions);
              return { finding, result, validation };
            }),
          );
        }

        const report = buildReport({
          changeSet,
          findings,
          unresolved: {
            imports: indexResult.unresolvedImports,
            annotations: indexResult.unresolvedAnnotations,
            danglingReferences: indexResult.danglingReferences,
          },
          proposedPatches,
        });

        const output =
          options.format === 'json'
            ? renderJson(report)
            : options.format === 'annotations'
              ? renderAnnotations(report)
              : renderMarkdown(report);

        if (options.out) {
          await writeFile(resolve(options.out), output, 'utf-8');
          console.error(`Report written to ${options.out}`);
        } else {
          console.log(output);
        }
      } finally {
        store.close();
      }
    },
  );

function printValidation(validation: Awaited<ReturnType<typeof validatePatch>>): void {
  console.log(`  Validation: ${validation.valid ? 'valid' : 'INVALID'}`);
  for (const issue of validation.issues) {
    console.log(`    [${issue.severity}] ${issue.check}: ${issue.message}`);
  }
  if (validation.checksNotPerformed.length > 0) {
    console.log(`    (not checked: ${validation.checksNotPerformed.join(', ')})`);
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
