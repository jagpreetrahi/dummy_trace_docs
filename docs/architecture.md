# TraceDocs Architecture

## What this is

TraceDocs builds a dependency graph between source code and documentation, then
uses it to answer one question when code changes: *what documentation might
now be wrong, and why?* It is not a documentation generator — it proposes
evidence-backed, human-reviewed updates only where a real relationship exists.

## Monorepo layout

pnpm workspace, one package per pipeline stage so each is independently
testable and swappable:

```
packages/
├── core/            shared types (no runtime dependencies)
├── scanner/          repository discovery, git revision, hashing (Milestone 1 — done)
├── parser-ts/        JS/TS symbol extraction (Milestone 2 — done)
├── parser-md/        Markdown section/annotation extraction (Milestone 2 — done)
├── graph/            SQLite-backed dependency graph + migrations (Milestone 3 — done)
├── indexer/          wires scanner+parsers+graph into indexRepository() (Milestone 3 — done)
├── change-analyzer/  git diff -> structured change set (Milestone 5)
├── impact-analyzer/  graph-based documentation impact rules (Milestone 6)
├── generator/        LLM provider abstraction + patch generation (Milestone 7)
├── validator/         Markdown/patch validation (Milestone 8)
├── cli/              `tracedocs` command line entry point
├── server/           Fastify API (Milestone 4)
└── web/              React/Vite graph explorer (Milestone 4)
```

Dependencies flow one way: `core` has no dependencies; every other package may
depend on `core` and on packages strictly earlier in the pipeline. This keeps
the graph engine, for instance, ignorant of the LLM provider, and the parser
ignorant of the CLI.

## Pipeline

```
scan -> parse -> build graph -> diff revisions -> impact analysis
     -> (optional) generate patch -> validate -> report / review / apply
```

Each arrow is a package boundary. A stage never reaches past its neighbors —
the impact analyzer consults the graph, not raw source files; the generator
receives a bounded context object, not the whole repository.

## Key decisions made in Milestone 1

- **Package manager: pnpm workspaces.** Chosen over npm/yarn workspaces for
  fast, disk-efficient installs and because `workspace:*` protocol makes
  internal package versioning explicit.
- **TypeScript module resolution: `Bundler`.** `NodeNext` was tried first
  (matching Node's native ESM resolution most strictly) but several
  CommonJS dependencies (e.g. `ignore`) ship `.d.ts` files that don't
  round-trip cleanly through `NodeNext`'s stricter ESM/CJS boundary
  checking. `Bundler` resolution (paired with `module: ESNext`) is what
  `vitest` and `tsx` already use internally, so switching avoids a
  dev-time/build-time resolution mismatch. Runtime output still respects
  Node's real module system: every package sets `"type": "module"` and
  relative imports keep explicit `.js` extensions.
- **Project references + `tsc -b` for building.** Packages depend on each
  other's compiled output (`dist/`), so the root `tsconfig.json` lists all
  packages as references and `pnpm run build` / `pnpm run typecheck` both
  run `tsc -b`, which builds them in dependency order and skips
  already-up-to-date packages on incremental runs.
- **No database yet.** Milestone 1 only needs to detect "did this file
  change since the last run," which a flat `.tracedocs/manifest.json` (path
  → content hash) answers without a real DB. SQLite is introduced in
  Milestone 3 once there's an actual graph to persist.
- **Git access via `simple-git`.** Chosen over hand-rolled `execFile git`
  calls for readable async APIs; it shells out to the system `git` binary
  under the hood, same as the raw approach would.

## Key decisions made in Milestone 2

- **TypeScript Compiler API instead of tree-sitter for JS/TS.** The brief
  suggests tree-sitter; `parser-ts` uses `typescript`'s own parser instead.
  Reasons: (1) tree-sitter's Node bindings are native modules requiring
  `node-gyp`/a C toolchain — a real risk flagged in Milestone 0, especially
  on Windows; the TS Compiler API is pure JS/TS with no native build step;
  (2) it's the same parser `tsc` itself uses, so JSDoc, export semantics,
  and modifier flags (`export`, `default`, `static`) are read authoritatively
  rather than re-derived from generic syntax nodes. The tradeoff: `parser-ts`
  is JS/TS-specific and cannot be reused for Python/Go. Tree-sitter (or
  another dedicated parser) remains the right choice for those, added later
  behind the same `ParsedSourceFile` shape so the graph builder doesn't care
  which parser produced it.
- **Syntactic parsing only, no type checker.** `parseTypeScriptFile` uses
  `ts.createSourceFile` directly rather than building a full `ts.Program`.
  A type checker would let us resolve `import`s and calls to their actual
  declarations, but requires a valid, resolvable `tsconfig.json` for every
  scanned repo and is much slower per file. Cross-file resolution (turning
  raw import specifiers and callee text into real edges) is deferred to the
  graph builder in Milestone 3, which can do it once, project-wide, instead
  of per-file.
- **JSDoc via public APIs only.** `ts.getLeadingCommentRanges` + manual
  `@tag` parsing, instead of the commonly-used but internal `node.jsDoc`
  property, so this doesn't break on a future TypeScript upgrade.
- **Calls are recorded as text, not resolved symbols.** A call's `calleeName`
  is the literal source text of the callee expression (e.g. `authService.refresh`),
  restricted to identifier / `this` / property-access chains — dynamic
  callees (`arr[i]()`, optional chaining, IIFEs) are skipped rather than
  guessed at. Resolving `calleeName` text to an actual symbol id is a graph
  builder concern (Milestone 3), since it requires knowing what a name
  resolves to across imports.
- **Markdown sections are non-overlapping and flat.** Each heading (at any
  depth) owns a contiguous span up to the *next* heading of any depth —
  a `##` subsection is its own section, not nested inside its parent `#`'s
  range. This avoids ambiguity about which section "owns" content when a
  document is later patched, at the cost of not modeling heading hierarchy
  explicitly (a section's parent heading can still be recovered later from
  `depth` if needed).
- **Annotation validation is syntax-only for now.** `<!-- tracedocs:documents
  <target> -->` is checked for a known directive and a non-empty target;
  whether `target` actually resolves to a real symbol requires the graph
  and is deferred to Milestone 3/6.

## Key decisions made in Milestone 3

- **`node:sqlite` instead of `better-sqlite3`.** The brief suggests SQLite
  without mandating a driver. `better-sqlite3` is the common choice but
  ships native bindings requiring a C toolchain to build — the same class
  of Windows risk flagged for tree-sitter in Milestone 0. Node 22.5+ has a
  built-in `node:sqlite` (`DatabaseSync`) with no native build step at all,
  confirmed working here without any flag. It's marked experimental
  (API may change before it stabilizes), so all access goes through
  `GraphStore` — if it ever needs replacing, that's the only file that
  changes. `package.json` pins `"engines": {"node": ">=22.5.0"}` on the
  `graph` package accordingly.
- **Surrogate integer keys, not the stable string id, as the primary key.**
  `nodes.id`/`edges.id` are `INTEGER PRIMARY KEY` for fast joins and small
  foreign keys; `nodes.stable_id` (the parser/indexer-produced string) is a
  separately unique-indexed column. Call sites address nodes by stable id
  (`NewGraphEdge.sourceStableId`) and never need to know or track the
  surrogate key — `GraphStore.upsertEdge` resolves it internally.
- **Different evidence types for the same edge never collide.** The edges
  table's uniqueness constraint is `(repository_id, source_node_id,
  target_node_id, type, evidence_type)` — evidence type is part of the key,
  not just a column. A `static_analysis` edge and an `ai_inferred` edge
  between the same two nodes are two separate rows, so a future weaker
  AI-inferred guess can never silently overwrite a stronger static-analysis
  or explicit-annotation edge (required by brief §D); tested in
  `packages/graph/test/nodesAndEdges.test.ts`.
- **Certainty is currently always `HIGH`, assigned by rule, not a model.**
  Every edge Milestone 3 creates (`CONTAINS`, resolved `IMPORTS`, same-file
  `CALLS`, explicit-annotation `DOCUMENTS`) comes from unambiguous static
  evidence — the parser found the exact syntax, or a maintainer wrote the
  annotation — so there's no graded confidence to express yet. `MEDIUM`/`LOW`
  become meaningful once Milestone 6 adds inferred (non-explicit) doc-code
  relationships; nothing here treats these labels as calibrated
  probabilities (brief §F).
- **Call resolution is same-file only.** `buildCallEdges` resolves a bare
  identifier to a same-file function, and `this.method()` to a sibling
  method on the caller's own class — both from evidence already in that
  one file. Resolving a call through an import binding to another file's
  export is deferred: it would require carrying each file's import-name ->
  target mapping into the call resolver, which is a meaningfully bigger
  piece of cross-file name resolution than "does this edge's target exist."
  Skipped calls create no edge and are not reported as unresolved (unlike
  imports/annotations) — an unresolved *declared* relationship (an import,
  an annotation) is worth surfacing; a call to some arbitrary expression
  the resolver didn't attempt is not a declared relationship at all, and
  reporting every one would be mostly noise (any call to a third-party or
  standard-library function would show up).
- **Delete-and-reinsert per changed file, not diffing old vs. new symbols.**
  When a file is (re)indexed, `GraphStore.deleteNodesForFile` removes every
  node with that `file_path` (cascading their edges) before the fresh parse
  is inserted. This is what makes a renamed/removed function's old node
  actually disappear instead of accumulating stale nodes — the alternative
  (diff old symbols vs. new ones to patch in place) is more code for the
  same observable result.
- **Cross-file dangling references are only detected for files touched in
  the current run.** Before deleting a file's nodes, `deleteNodesForFile`
  reports edges that crossed into/out of it from a file elsewhere in the
  repo (`DanglingReference`) — this is how deleting `token.ts` while
  `index.ts` still imports it gets surfaced. But if `index.ts` itself isn't
  reprocessed in a later run, its now-broken `IMPORTS` edge was still
  removed (cascade), just not re-reported as newly-dangling on that later
  run. Full re-verification of every surviving file's outbound references
  after an unrelated deletion is a correctness improvement left for the
  report generator (Milestone 9) rather than the indexer.
- **`DOCUMENTS` points from code to doc, not doc to code.** This matches
  the brief's own traversal example diagram (`refreshAccessToken() ->
  DOCUMENTS -> docs/authentication.md#refresh-tokens`) even though it reads
  backwards from the English sentence "the doc documents the function" —
  the diagram is the more authoritative source than the verb.
- **No `module` node type separate from `file`.** The brief lists File and
  Module as distinct node types; since this project's units are ES modules
  and a module is a file, one `file` node type covers both. Revisit only if
  a future language has a module concept that doesn't map 1:1 to a file.
- **The old `.tracedocs/manifest.json` is superseded, not kept alongside
  the graph.** `indexRepository` derives "what changed since last time"
  from the graph's own `files` table (`buildManifestFromGraph` reshapes it
  into the same `Manifest` type `diffAgainstManifest` already expects, so
  Milestone 1's diff logic is reused as-is). Keeping both the JSON manifest
  and the DB's `files` table would create two sources of truth that could
  disagree; `tracedocs index` now writes `.tracedocs/graph.db` and no
  longer writes `.tracedocs/manifest.json`. The scanner package's manifest
  functions still exist and are still tested — they're just no longer the
  thing the CLI's `index` command uses.

## Trust boundaries (see brief §12)

- The scanner never executes repository code or documentation content —
  it only reads file bytes to hash them and matches paths against
  `.gitignore`.
- Nothing is sent to a network service during scanning or indexing.
- All filesystem access in the scanner is confined to paths under the
  resolved repository root (`fast-glob`'s `cwd` + relative match results);
  no absolute or `..`-escaping paths are followed.

These hold today because Milestone 1 does no code execution and no network
I/O at all. They become load-bearing once the LLM generator (Milestone 7)
and patch application (Milestone 8) exist, and should be re-verified then.

## Current status

**Milestone 1 (repository scanning) is implemented and tested:**

- `discoverFiles` — `.gitignore`-aware discovery of `.ts/.tsx/.js/.jsx/.md/.mdx`
  files, with `node_modules`, `.git`, `dist`, `build`, `coverage` always
  excluded regardless of `.gitignore` content.
- `getCurrentRevision` — HEAD SHA, or `null` for a non-repo or a repo with
  no commits yet (never throws).
- `scanRepository` — combines discovery + git revision + SHA-256 content
  hashing into a `RepositoryScanResult`.
- `diffAgainstManifest` / `toManifest` — classify files as
  added/modified/removed/unchanged against the previous run's manifest,
  and persist a new one, enabling incremental work later without
  reprocessing unchanged files.
- CLI: `tracedocs index [path]` runs the above and prints a summary.

20 unit/integration tests cover language detection, hashing, `.gitignore`
handling, always-excluded directories, revision detection (including the
no-commits-yet case), and manifest diffing across two scans using real
temporary git repositories.

**Milestone 2 (parsing) is implemented and tested:**

- `@tracedocs/parser-ts` — `parseTypeScriptFile(repoRelativePath, sourceText)`
  extracts: functions (declarations and `const`/`let` arrow/function-expression
  assignments), classes, methods (including constructors, getters/setters,
  and arrow-function class fields), exported symbols (inline `export`
  modifiers, named/`*`/namespace re-exports, `export default`), imports
  (default/named/namespace, aliasing, type-only), statically identifiable
  calls (attributed to their enclosing function/method, or `null` for
  module-level), JSDoc (description + `@tag`s), and source locations.
  Unsupported syntax (computed method names, destructured exports,
  `export =`) is reported in `unsupportedConstructs`, never silently
  dropped or guessed at.
- `@tracedocs/parser-md` — `parseMarkdownDocument(repoRelativePath, sourceText)`
  extracts headings (with GitHub-compatible anchor slugs, including
  duplicate disambiguation), non-overlapping sections with raw content and
  source ranges, links (classified internal vs. external), fenced code
  blocks with language, a heuristic classification of inline code spans as
  symbol-like or file-path-like, and explicit `tracedocs:` annotations with
  syntactic well-formedness checks.
- Both parsers are purely syntactic and read-only: no type checker, no
  cross-file resolution, no network access — they take a string and a path
  and return structured evidence.

31 tests across both packages (functions, classes/methods, imports/exports,
calls including the anonymous-callback and dynamic-callee cases,
headings/sections, links/fences, symbol references, annotations).

Not yet handled even within parsing scope: routes and
configuration-declaration extraction (spec section C mentions these, but
they require framework-specific pattern matching and aren't in Milestone
2's task list); interfaces, type aliases, and enums are not extracted as
symbols since they aren't runtime code the graph needs to track relationships
for.

**Milestone 3 (dependency graph) is implemented and tested:**

- `@tracedocs/graph` — SQLite schema (all 7 tables from brief §7, via
  `node:sqlite`) with a numbered-migration runner; `GraphStore`, the single
  typed entry point for repository/file/node/edge storage plus traversal
  (`traverse` — bounded-depth BFS, cycle-safe via a visited set) and
  `findPath` (BFS shortest path, used to explain *how* two nodes connect).
  Upserts are keyed by stable id so re-indexing an unchanged file creates
  no duplicates; `deleteNodesForFile` removes a file's nodes (cascading
  their edges) and reports any edge that crossed into/out of that file from
  elsewhere as a `DanglingReference`.
- `@tracedocs/indexer` — `indexRepository(repoRoot, store)` orchestrates
  scanner + both parsers + the graph: diffs against the graph's own `files`
  table, re-parses only added/modified files, deletes-and-reinserts each
  changed file's nodes, then resolves cross-file `IMPORTS` edges (relative
  specifiers only, against the actual indexed file set), same-file `CALLS`
  edges (bare identifiers and `this.method()`), and `DOCUMENTS` edges from
  well-formed `tracedocs:documents` annotations (resolved by file path +
  qualified name, ambiguous/missing targets reported, never guessed).
  Removed files are deleted; renamed files are handled as delete-old +
  add-new (the scanner doesn't do rename detection yet).
- CLI: `tracedocs index [path]` now scans, parses, and updates
  `.tracedocs/graph.db`, reporting file changes, total nodes/edges, and any
  unresolved imports/annotations or new dangling references. `tracedocs
  graph [path]` prints node/edge counts by type.

29 tests in `graph` (CRUD, upsert idempotency, cascade-delete with dangling
detection, cycle-safe traversal, path-finding including "no path within
maxDepth") and 18 in `indexer` (CONTAINS/IMPORTS/CALLS/DOCUMENTS edge
creation, unresolved-import and unresolved-annotation reporting,
same-repository-twice idempotency, unrelated-file-untouched, rename
detection, and delete-with-dangling-reference). Full workspace: 98 tests.

**Not yet implemented:** change analysis (Milestone 5 — currently
`indexRepository` diffs the working tree against the graph's last-indexed
state, not two arbitrary git revisions), impact analysis, generation,
validation, the graph explorer UI, and GitHub integration. Within graph
scope specifically: `TESTS`/`REFERENCES`/`CONFIGURES`/`EXPOSES`/`LINKS_TO`
edge types and `api_endpoint`/`configuration_item`/`test`/`code_example`
node types exist in the brief's model but nothing populates them yet — see
the `GraphNodeType`/`GraphEdgeType` unions in `packages/core/src/graph-types.ts`
for exactly what's live. See the milestone list in the project brief for
sequencing.
