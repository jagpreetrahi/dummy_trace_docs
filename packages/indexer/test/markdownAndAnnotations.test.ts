import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '@tracedocs/graph';
import { docPageStableId, docSectionStableId } from '../src/buildMarkdownFile.js';
import { indexRepository } from '../src/indexRepository.js';
import { createTempRepo, type TempRepo } from './helpers/tempRepo.js';

describe('indexing markdown files', () => {
  let repo: TempRepo;
  let store: GraphStore;

  beforeEach(async () => {
    repo = await createTempRepo();
    store = GraphStore.open(':memory:');
  });

  afterEach(async () => {
    store.close();
    await repo.cleanup();
  });

  it('creates a documentation page node and a section node per heading', async () => {
    await repo.writeFile('docs/guide.md', '# Guide\n\nIntro.\n\n## Setup\n\nDo this.\n');

    const result = await indexRepository(repo.root, store);

    const page = store.getNodeByStableId(result.repositoryId, docPageStableId('docs/guide.md'));
    const section = store.getNodeByStableId(result.repositoryId, docSectionStableId('docs/guide.md', 'setup'));
    expect(page).toBeDefined();
    expect(section).toBeDefined();
    expect(store.listOutgoingEdges(page!.id, 'CONTAINS').map((e) => e.targetNodeId)).toContain(section!.id);
  });

  it('resolves a well-formed annotation to a DOCUMENTS edge from code to the doc section', async () => {
    await repo.writeFile('src/token.ts', 'export function refreshAccessToken() { return 1; }');
    await repo.writeFile(
      'docs/authentication.md',
      '# Authentication\n\n## Refresh tokens\n\n<!-- tracedocs:documents src/token.ts#refreshAccessToken -->\nDetails here.\n',
    );

    const result = await indexRepository(repo.root, store);

    const codeNode = store.getNodeByStableId(result.repositoryId, 'src/token.ts#refreshAccessToken:function');
    const sectionNode = store.getNodeByStableId(
      result.repositoryId,
      docSectionStableId('docs/authentication.md', 'refresh-tokens'),
    );
    const documentsEdges = store.listOutgoingEdges(codeNode!.id, 'DOCUMENTS');

    expect(documentsEdges).toHaveLength(1);
    expect(documentsEdges[0]?.targetNodeId).toBe(sectionNode!.id);
    expect(documentsEdges[0]?.evidenceType).toBe('explicit_annotation');
    expect(result.unresolvedAnnotations).toEqual([]);
  });

  it('reports an annotation pointing at a nonexistent symbol as unresolved', async () => {
    await repo.writeFile(
      'docs/a.md',
      '<!-- tracedocs:documents src/does-not-exist.ts#nothing -->\n',
    );

    const result = await indexRepository(repo.root, store);

    expect(result.unresolvedAnnotations).toHaveLength(1);
    expect(result.unresolvedAnnotations[0]?.target).toBe('src/does-not-exist.ts#nothing');
  });

  it('reports a malformed annotation (unknown directive) as unresolved', async () => {
    await repo.writeFile('docs/a.md', '<!-- tracedocs:frobnicate src/x.ts -->\n');

    const result = await indexRepository(repo.root, store);

    expect(result.unresolvedAnnotations).toHaveLength(1);
  });

  it('keeps the DOCUMENTS edge when the documented code changes but the doc file does not', async () => {
    // Regression test: re-indexing a changed code file deletes and
    // reinserts its nodes, including one whose stable id doesn't change —
    // that must not silently drop the DOCUMENTS edge pointing at it just
    // because the annotating doc file itself wasn't touched this run.
    await repo.writeFile('src/token.ts', 'export function refreshAccessToken() { return 1; }');
    await repo.writeFile(
      'docs/authentication.md',
      '# Authentication\n\n## Refresh tokens\n\n<!-- tracedocs:documents src/token.ts#refreshAccessToken -->\nDetails here.\n',
    );
    const first = await indexRepository(repo.root, store);
    const codeNodeBefore = store.getNodeByStableId(first.repositoryId, 'src/token.ts#refreshAccessToken:function');
    expect(store.listOutgoingEdges(codeNodeBefore!.id, 'DOCUMENTS')).toHaveLength(1);

    // Change only the function's body — same file path, same qualified name,
    // same stable id — and leave the doc file completely untouched.
    await repo.writeFile(
      'src/token.ts',
      'export function refreshAccessToken(force: boolean) { return force ? 1 : 2; }',
    );
    const second = await indexRepository(repo.root, store);

    const codeNodeAfter = store.getNodeByStableId(second.repositoryId, 'src/token.ts#refreshAccessToken:function');
    expect(store.listOutgoingEdges(codeNodeAfter!.id, 'DOCUMENTS')).toHaveLength(1);
  });

  it('attributes an annotation before any heading to the page node', async () => {
    await repo.writeFile('src/a.ts', 'export function foo() {}');
    await repo.writeFile('docs/a.md', '<!-- tracedocs:documents src/a.ts#foo -->\n\n# Title\n');

    const result = await indexRepository(repo.root, store);

    const codeNode = store.getNodeByStableId(result.repositoryId, 'src/a.ts#foo:function');
    const pageNode = store.getNodeByStableId(result.repositoryId, docPageStableId('docs/a.md'));
    const edges = store.listOutgoingEdges(codeNode!.id, 'DOCUMENTS');

    expect(edges[0]?.targetNodeId).toBe(pageNode!.id);
  });
});
