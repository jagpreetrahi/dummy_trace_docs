import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ParsedMarkdownDocument, ParsedSourceFile } from '@tracedocs/core';
import type { DanglingReference, GraphStore } from '@tracedocs/graph';
import { parseMarkdownDocument } from '@tracedocs/parser-md';
import { parseTypeScriptFile } from '@tracedocs/parser-ts';
import { diffAgainstManifest, scanRepository } from '@tracedocs/scanner';
import { buildAnnotationEdges, type UnresolvedAnnotation } from './buildAnnotationEdges.js';
import { buildCallEdges } from './buildCallEdges.js';
import { insertCodeFileNodes } from './buildCodeFile.js';
import { buildImportEdges, type UnresolvedImport } from './buildImportEdges.js';
import { insertMarkdownFileNodes, type MarkdownFileIndex } from './buildMarkdownFile.js';
import { buildManifestFromGraph } from './manifestFromGraph.js';

export interface IndexResult {
  repositoryId: number;
  revision: string | null;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  filesUnchanged: number;
  totalNodes: number;
  totalEdges: number;
  unresolvedImports: UnresolvedImport[];
  unresolvedAnnotations: UnresolvedAnnotation[];
  danglingReferences: DanglingReference[];
}

/**
 * Indexes a repository into the graph: scans for supported files, parses
 * whatever changed since the last run, and rebuilds their nodes and edges.
 * Unchanged files are left untouched — their nodes, and any edges other
 * files have into them, are already correct. Re-running this against an
 * unchanged repository produces no new nodes or edges (see
 * `packages/graph`'s upsert-by-stable-id semantics).
 */
export async function indexRepository(repoRoot: string, store: GraphStore): Promise<IndexResult> {
  const repositoryId = store.upsertRepository(repoRoot);

  const scan = await scanRepository(repoRoot);
  const previousManifest = buildManifestFromGraph(store, repositoryId);
  const changes = diffAgainstManifest(scan, previousManifest);

  const danglingReferences: DanglingReference[] = [];
  const unresolvedImports: UnresolvedImport[] = [];
  const unresolvedAnnotations: UnresolvedAnnotation[] = [];

  for (const path of changes.removed) {
    danglingReferences.push(...store.deleteNodesForFile(repositoryId, path));
    store.deleteFile(repositoryId, path);
  }

  const changedCodeFiles = [...changes.added, ...changes.modified];

  // A changed code file's nodes are about to be deleted and reinserted —
  // even a symbol whose identity (stable id) doesn't change loses its
  // edges in that process. Any doc that currently has a DOCUMENTS edge
  // into this file needs to be reprocessed too, or that relationship
  // would just be silently dropped instead of correctly re-resolved
  // against the fresh node. Computed now, before anything is deleted.
  const affectedDocFiles = new Set<string>();
  for (const path of changedCodeFiles) {
    for (const docPath of store.findDocumentationFilesReferencing(repositoryId, path)) {
      if (!changedCodeFiles.includes(docPath) && !changes.removed.includes(docPath)) {
        affectedDocFiles.add(docPath);
      }
    }
  }

  const filesToProcess = [...changedCodeFiles, ...affectedDocFiles];
  const knownFilePaths = new Set(scan.files.map((f) => f.repoRelativePath));

  const parsedCodeByPath = new Map<string, ParsedSourceFile>();
  const parsedMarkdownByPath = new Map<string, { doc: ParsedMarkdownDocument; index: MarkdownFileIndex }>();

  for (const path of filesToProcess) {
    // Clear whatever this file previously contributed before re-parsing —
    // a renamed/removed symbol must not leave a stale node behind.
    danglingReferences.push(...store.deleteNodesForFile(repositoryId, path));

    const scannedFile = scan.files.find((f) => f.repoRelativePath === path);
    if (!scannedFile) continue; // path came from this same scan; defensive only
    const content = await readFile(join(repoRoot, path), 'utf-8');

    if (scannedFile.language === 'markdown') {
      const doc = parseMarkdownDocument(path, content);
      const index = insertMarkdownFileNodes(
        store,
        repositoryId,
        path,
        scannedFile.contentHash,
        scan.scannedAt,
        doc,
      );
      parsedMarkdownByPath.set(path, { doc, index });
    } else {
      const parsed = parseTypeScriptFile(path, content);
      insertCodeFileNodes(
        store,
        repositoryId,
        path,
        scannedFile.language,
        scannedFile.contentHash,
        scan.scannedAt,
        parsed,
      );
      parsedCodeByPath.set(path, parsed);
    }
  }

  // Second pass: edges that reach across files (imports, and annotations
  // resolving against symbols that may live in an unchanged file).
  for (const [path, parsed] of parsedCodeByPath) {
    unresolvedImports.push(...buildImportEdges(store, repositoryId, path, parsed, knownFilePaths));
    buildCallEdges(store, repositoryId, parsed);
  }
  for (const [path, { doc, index }] of parsedMarkdownByPath) {
    unresolvedAnnotations.push(...buildAnnotationEdges(store, repositoryId, path, doc, index));
  }

  store.markRepositoryIndexed(repositoryId, scan.revision, scan.scannedAt);

  return {
    repositoryId,
    revision: scan.revision,
    filesAdded: changes.added.length,
    filesModified: changes.modified.length,
    filesRemoved: changes.removed.length,
    filesUnchanged: changes.unchanged.length,
    totalNodes: store.countNodes(repositoryId),
    totalEdges: store.countEdges(repositoryId),
    unresolvedImports,
    unresolvedAnnotations,
    danglingReferences,
  };
}
