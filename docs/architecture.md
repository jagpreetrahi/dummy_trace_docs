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
├── change-analyzer/  git diff -> structured change set (Milestone 5 — done)
├── impact-analyzer/  graph-based documentation impact rules (Milestone 6 — done)
├── generator/        LLM provider abstraction + patch generation (Milestone 7 — done)
├── validator/         Markdown/patch validation + safe local apply (Milestone 8 — done)
├── report/            structured JSON/Markdown/annotation reports (Milestone 9 — done)
├── cli/              `tracedocs` command line entry point
├── server/           Fastify API over the graph (Milestone 4 — done)
└── web/              React/Vite/Cytoscape graph explorer (Milestone 4 — done)
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

## Key decisions made in Milestone 4

- **Two new packages, not one.** `server` (Fastify + Zod) exposes the graph
  over HTTP; `web` (React + Vite + Cytoscape) consumes that HTTP API. They
  don't share process memory or import each other — `web` only knows JSON
  shapes over `fetch`, matching how the brief's non-goals rule out a
  "mandatory" tight coupling and keeps the API independently useful (a
  future GitHub Action or another UI could call it too).
- **The server's graph database is separate from the CLI's per-repo one.**
  `tracedocs index` (CLI) writes `<repo>/.tracedocs/graph.db`. The server
  defaults to its own `.tracedocs/server.db` (overridable via `TRACEDOCS_DB`)
  and *registers* repositories into it via `POST /api/repositories/index`,
  because the schema's `repositories` table already supports many
  repositories in one database — `GET /api/repositories` listing several
  only makes sense against one shared file. Both paths run the identical
  `indexRepository()`; only which `GraphStore` file receives the writes
  differs.
- **Validation with Zod, not a schema-validation Fastify plugin.** Route
  handlers call a small `parseOrThrow(schema, input)` helper directly
  rather than wiring `fastify-type-provider-zod` — one fewer dependency's
  worth of integration surface for a request shape this simple (path/query
  params, one POST body), at the cost of not getting OpenAPI generation
  for free. Revisit if the API surface grows enough that hand-written
  validation stops being the clear win.
- **`GraphStore.listNodes`/`listEdges` always cap results (`limit`,
  default 300, max 2000).** Matches the brief's explicit warning against
  rendering thousands of nodes with no strategy — the graph endpoint
  reports `truncated: true` when the cap was hit rather than silently
  returning a partial graph that looks complete.
- **The `/graph` endpoint drops edges whose endpoints aren't both in the
  returned node set.** Filtering to `types=function` and still receiving a
  `CONTAINS` edge pointing at a `file` node the client was never sent would
  render as a dangling arrow into nothing; edges are filtered to only
  those fully contained in whatever node set (filtered and/or
  limit-truncated) was actually returned.
- **Cytoscape integrated directly, not through a React wrapper.** The
  brief specifies Cytoscape.js; there's no dependency decision to explain
  there. What's a real decision: `GraphCanvas` drives the `cytoscape` core
  library imperatively from a handful of `useEffect`s (init once; replace
  all elements when `nodes`/`edges` change; toggle `selected`/`highlighted`
  classes when selection changes) rather than adding a React-Cytoscape
  binding package — the lifecycle is small enough that the extra
  abstraction wouldn't pay for itself.
- **React 18 and Vite 6, not the newest majors (React 19, Vite 8).** Both
  work fine with this project's Node/TypeScript setup, but this project
  already introduced enough new surface (`node:sqlite`, a fresh monorepo,
  a from-scratch API) that picking the most battle-tested stable majors
  for the one part with the largest ecosystem (React) was the lower-risk
  call. Nothing here depends on a React 19-only or Vite 8-only feature.
- **Checkboxes default to fully-checked, not empty-means-all.** An early
  draft used "empty type filter set = show everything" to avoid sending
  redundant query params, but that makes unchecking one box from a
  fully-checked state add it back as the *only* selected type (toggling
  into an empty set reads as "select all" both before and after, so the
  direction of the click is ambiguous). Filter state now always holds the
  literal set of currently-checked types, applied as-is.
- **UI copy translates the data model's exact vocabulary
  (`documentation_section`, `CALLS`, `evidence_type`) into plain language**
  (`labels.ts`: "Doc section", "Calls", tooltips explaining each
  relationship) everywhere it's shown to a person, while the API and
  database keep the brief's precise terms. Surfaced directly by user
  testing during this milestone: the raw schema vocabulary was
  reported as confusing on first use of the explorer.

## Key decisions made in Milestone 5

- **Rename detection uses git's own `-M` flag, not our own heuristic.**
  The scanner's Milestone 1 diffing (content-hash comparison against a
  manifest) has no way to know a deleted path and an added path are the
  same file — it necessarily reports a rename as delete+add. `git diff
  --name-status -M` compares blob similarity directly and reports `R###`
  status lines, which is both more accurate and less code than
  reimplementing similarity detection. The real constraint this exposes:
  rename detection is fundamentally a *tracked-file* comparison — git has
  nothing to correlate a change against for a file that was never staged
  or committed. Tested and documented explicitly (not left as a silent
  surprise): renaming a **committed** file between two revisions is
  detected correctly; renaming an **uncommitted** file (working-tree-only)
  is reported as delete+add, because that's genuinely what git itself can
  see. `docs-code` doesn't try to work around this with content-hash
  matching of its own — doing that only for the change-analyzer while the
  graph indexer still can't see renames either would be an inconsistent,
  partial fix; a real solution belongs in the scanner, not here.
- **`git diff <base>` (no second ref) misses untracked new files —
  handled by also calling `git ls-files --others --exclude-standard`.**
  This was caught by the test suite, not anticipated: `getChangedFiles`
  initially only wrapped `git diff --name-status`, and a test for "added
  file against the working tree" failed because a brand-new, never-staged
  file is invisible to plain `git diff` (it only diffs what git already
  tracks). Untracked files are now unioned in explicitly, and this
  behavior — plus its interaction with the rename limitation above — is
  covered by tests, not just fixed and left undocumented.
- **Symbol changes are detected by comparing each matched symbol's own
  source text, not by diffing a synthesized "signature."** `parser-ts`
  doesn't extract parameter lists or return types as structured fields
  (Milestone 2's scope was declarations/imports/exports/calls, not full
  type signatures), so there's no signature object to diff. Instead, each
  symbol's own line range is sliced from the old and new file content
  (using *that symbol's own* location in *its own* file version, never a
  shared line offset — line numbers shift when unrelated code earlier in
  the file changes) and hashed; a mismatch means something inside that
  symbol changed. This correctly catches parameter changes, body changes,
  and JSDoc changes alike, at the cost of not being able to say
  *specifically* "the second parameter's type changed" — only "this
  symbol's source differs." That coarser evidence is what
  `SymbolChange.evidence` honestly reports.
- **Symbols are matched between revisions by `(kind, qualifiedName)`, not
  by stable id.** A symbol's `stableId` embeds its file path
  (`src/token.ts#refreshAccessToken:function`), so the *same* symbol in
  the old and new revision has *different* stable ids whenever the file
  changes — which includes the exact rename/move cases this milestone
  needs to detect. Matching on kind + qualified name only (ignoring path)
  is what lets a moved symbol be recognized as "the same symbol,
  elsewhere" instead of two unrelated stable ids.
- **A "move" requires exact matching text, not just a matching name.**
  Two unrelated functions both named `helper` with different bodies are
  not a move — they're a removal in one file and an addition in another,
  reported separately. Only when the qualified name *and* kind *and* the
  full source text hash all match across two different files is it
  confident enough to call a "move" rather than a coincidence. Tested
  explicitly (`moveDetection.test.ts`) with both a same-named/
  different-content case and a different-named/same-content case, to
  pin down that neither alone is sufficient evidence.
- **No signature-level "changed exports" detection beyond what falls out
  of symbol diffing.** The brief's Change Analyzer section (§E) lists
  "changed exports" as its own bullet; Milestone 5's explicit task list
  (§16) does not. In practice, adding/removing the `export` keyword on an
  otherwise-unchanged declaration already surfaces as a `modified` symbol
  change (the modifier is part of the declaration's own source range), so
  the common case is covered without a dedicated export-list differ.
  Explicit re-export changes (`export { x } from './y'` added/removed with
  no corresponding local declaration change) are not separately detected —
  documented here as a known gap rather than silently missing it.
- **`change-analyzer` does not depend on `graph` or `indexer`.** It only
  needs git and the two Milestone 2 parsers to answer "what changed."
  Consuming a `ChangeSet` together with the persistent graph to decide
  *which documentation* is affected is the impact analyzer's job
  (Milestone 6) — keeping this package graph-free is what Engineering
  Rule #3 ("separate parsing, graph logic, change analysis, impact
  analysis, and generation") means in practice here.

## Key decisions made in Milestone 6

- **`analyzeImpact` is a pure function of `(ChangeSet, GraphStore,
  repositoryId, DanglingReference[])`** — no dependency on
  `change-analyzer` or `indexer` themselves, only on the *data* they
  produce (from `@tracedocs/core` and `@tracedocs/graph`). This keeps the
  package trivially testable (seed a `GraphStore` directly, construct a
  `ChangeSet` literal — no git repos, no filesystem, tests run in
  milliseconds) and matches Rule #3's separation the same way
  `change-analyzer` does.
- **Real bug found and fixed while wiring the CLI's `impact` command
  end-to-end, not by unit tests alone**: a `modified` symbol that kept its
  exact identity (same stable id — only its body changed) was still
  losing its `DOCUMENTS` edge, because `indexRepository`'s
  delete-and-reinsert strategy (Milestone 3) wipes *all* of a changed
  file's edges before reinserting, and nothing re-created the edge unless
  the *documentation* file was also reprocessed in that same run — which
  it wasn't, since only the code file had actually changed. Manually
  running `tracedocs impact` against a real fixture surfaced this
  immediately (the modified, documented function produced zero findings).
  Fixed at the source: `GraphStore.findDocumentationFilesReferencing`
  finds which doc files currently reference a given code file, and
  `indexRepository` now expands its per-run file set to include those doc
  files whenever the code they reference is about to be reprocessed —
  so their annotations get correctly re-resolved against the fresh nodes
  instead of just losing the edge. Covered by a regression test
  (`indexer/test/markdownAndAnnotations.test.ts`) and a new direct test of
  the `GraphStore` method itself, not just left as a fixed-and-forgotten
  manual finding.
- **Bounded traversal for `modified` symbols walks CONTAINS (incoming)
  and DOCUMENTS (outgoing) only — never CALLS.** The brief's own worked
  example (`refreshAccessToken() → AuthenticationService →
  docs/authentication.md`) is exactly a containment relationship: a
  change to a method is relevant to documentation about its class or file.
  "Things this function calls might be documented somewhere" is a
  meaningfully weaker, noisier signal — a modified leaf utility function
  could easily be called by a dozen unrelated things — and was left out to
  avoid exactly the false-positive noise the brief warns against
  (§F: "avoid creating a documentation update merely to demonstrate AI
  functionality"). Revisit only with real evidence it's worth the noise.
- **Certainty is assigned purely by graph distance: HIGH at depth 0
  (the changed symbol itself is documented), MEDIUM at depth 1 (its
  direct container is), LOW at depth 2 (two containment hops up,
  typically the file).** Documented here per the brief's explicit
  requirement (§F) to say how these labels are assigned, and deliberately
  not framed as calibrated probabilities — nothing has been evaluated
  against labeled data to justify a number.
- **`removed`/`moved` symbols only ever get depth-0-equivalent findings,
  never bounded traversal.** Once a symbol is deleted, its old graph
  node — and everything that would let a "class"/"file" containment walk
  happen — is gone with it; only the specific dangling `DOCUMENTS` edge
  captured at the moment of deletion survives as evidence. A future
  improvement could look up whether the symbol's *former* container still
  exists and is separately documented, but that requires carrying
  additional context this milestone doesn't currently thread through
  (documented as a known gap, not attempted here).
- **A finding is downgraded from `REVIEW` to `NEEDS_MORE_INFORMATION`
  when the affected doc file was also changed in the same diff.** This is
  a deliberate, if blunt, way to reduce false-alarm noise per the brief's
  "avoid needlessly flagging" principle: if the author already touched
  that doc file, a confident "please review, this might be stale" could
  just be wrong (they may have already fixed it) — but silently dropping
  the finding would also be wrong (they may not have addressed *this
  specific* relationship). `NEEDS_MORE_INFORMATION` is the honest middle
  ground: something changed on both sides, verify it's actually resolved.
- **`PROPOSE_UPDATE` is never assigned by anything in Milestone 6.** It's
  part of the `ImpactAction` type (matching the brief's four-value list)
  but reserved until the generator (Milestone 7) exists to actually
  accompany a finding with a concrete patch — assigning it now, with
  nothing to propose, would violate Rule #17 ("do not claim a feature
  works until it has been implemented and tested").
- **`analyzeImpact` requires the caller to index the graph as part of the
  same base→target transition the `ChangeSet` describes** (documented as
  an explicit precondition in the function's own doc comment, not just
  here) — `modified`-symbol findings are looked up fresh against whatever
  the current graph is and don't depend on this, but `removed`/`moved`
  findings depend entirely on `danglingReferences` from that specific
  indexing call. The CLI's `impact` command reflects this constraint
  directly: it only ever compares `--base` against the current working
  tree (never an arbitrary `--target`), because `indexRepository` can only
  ever index what's actually on disk — there is no way to make the graph
  reflect an arbitrary historical revision without checking it out, and
  auto-checkout as a side effect of an "analyze" command would be an
  unacceptable mutation of the user's working directory.

## Key decisions made in Milestone 7

- **Three outcomes, not two.** `GenerationResult` is `PROPOSED |
  NEEDS_MORE_INFORMATION | PROVIDER_UNAVAILABLE`, deliberately keeping
  "the model looked at the evidence and it's not enough" separate from
  "the call itself failed" (network, auth, rate limit, an unparseable
  response). Collapsing those into one "couldn't generate a patch"
  outcome would hide a broken provider behind what looks like a
  considered judgment — directly the kind of silent stage-skipping
  Engineering Rule #18 rules out, and squarely what brief §13's "an AI
  provider is unavailable" test scenario is checking for.
- **Structured output via `client.messages.parse()` + `zodOutputFormat`,
  not manual JSON parsing or hand-rolled tool-use extraction.** This is
  the Anthropic SDK's own recommended pattern for schema-validated
  responses — the parsed result is guaranteed to match the Zod schema or
  `parsed_output` is `null`, which is treated as `PROVIDER_UNAVAILABLE`
  rather than trying to salvage a malformed response.
- **The generator package uses zod v4 independently of the server
  package's zod v3.** `@anthropic-ai/sdk`'s `zodOutputFormat` helper is
  built against zod v4's internal type surface (confirmed by a `tsc`
  error when first tried against v3 — see `docs/lessons-learned.md`
  entry 4's sibling issue, same category of generic-inference mismatch).
  pnpm lets independent packages in the workspace depend on different
  majors of the same library without conflict, so this is a one-line,
  fully contained fix rather than a workspace-wide zod v3→v4 migration
  the server package doesn't need.
- **Patch generation is scoped to `modified` findings with
  `action: 'REVIEW'` only** — never `removed`/`moved` (those still
  surface as impact findings from Milestone 6, just without an
  auto-generated patch) and never `NEEDS_MORE_INFORMATION` findings
  (the affected doc was already touched in this diff; asking the model
  to guess whether that already resolved things isn't a good use of a
  call). For a removed or moved symbol, "propose replacement text" is a
  genuinely different, harder problem — should the section be deleted,
  marked deprecated, or rewritten to point at the new location? — that
  needs product judgment this milestone doesn't attempt to encode.
  Documented as a real scope boundary, not silently dropped.
- **The mock provider is the CLI default; a real provider is opt-in via
  `--provider anthropic`.** This is what makes the non-goal "a mandatory
  paid LLM provider" concretely true rather than aspirational — the
  entire pipeline through `tracedocs generate` runs, and every test in
  this package runs, without any API key configured or network access.
- **`createAnthropicProvider()` never throws — even with no credentials
  configured anywhere.** Construction failures (no `ANTHROPIC_API_KEY`,
  no `ant auth login` profile, etc.) are caught once inside the factory
  and turned into a `PROVIDER_UNAVAILABLE` result on the first
  `generatePatch` call, rather than the factory itself throwing at a
  point the CLI would need a separate try/catch for. One error-handling
  path for every kind of provider failure, not two.
- **No test in `packages/generator` calls the real Anthropic API.**
  `anthropicProvider.test.ts` only exercises `describeProviderError`'s
  pure error-message mapping — constructing real
  `Anthropic.AuthenticationError`/`RateLimitError` instances to test the
  `instanceof` chain would mean guessing at SDK constructor shapes not
  documented for this use case, and the alternative (an actual
  unauthenticated network call) is exactly the kind of flaky,
  credential-dependent test this project's "mock provider for tests"
  requirement exists to avoid.
- **The generator never writes to disk.** `generateDocumentationUpdates`
  returns `ProposedPatch` values; nothing in this milestone applies one.
  Patch application — with staleness detection (has the target content
  changed since the patch was generated?) and explicit user approval —
  is Milestone 8's validator, not this package's job.

## Key decisions made in Milestone 8

- **`ProposedPatch` sections are re-located by heading text on every
  validate/apply call, never by a remembered line range.** Milestone 7's
  `ProposedPatch` deliberately doesn't store a line range (see its Key
  decisions) — `locateSection` re-parses the *current* document with
  `parser-md` and matches by `sectionHeading` text, reusing the exact
  same section-boundary logic the indexer used to derive the section in
  the first place. This is what makes "has this section's content
  changed since the patch was generated" a real comparison instead of a
  coordinate that could point at the wrong place after any unrelated
  edit earlier in the file.
- **DB persistence of `analysis_runs`/`impact_findings`/`proposed_patches`
  was deferred, and a real schema problem is why.** The brief's CLI
  example (§17) shows `tracedocs apply <patch-id>` as a separate command
  against previously stored results, and the schema for exactly this
  exists since Milestone 3's migration. Attempting to actually wire it up
  this milestone surfaced a real mismatch: `impact_findings.node_id` is
  `NOT NULL REFERENCES nodes(id)`, but a `removed`-symbol finding has no
  live node to reference — its node was already deleted by the time the
  finding exists. Properly fixing that means either a migration (nullable
  `node_id`, or storing a stable-id string instead of an FK) or reworking
  what `node_id` means for a finding whose subject is gone. Rather than
  force that schema rework into this milestone, `tracedocs generate
  --apply` validates and applies within one invocation — every item in
  Milestone 8's task list (validation, diff display, explicit approval,
  safe application) works without persisted state. Revisit when Milestone
  9's report generator needs persistence for its own reasons anyway.
- **Structural issues are `error` (block applying); link/anchor/
  content-heuristic issues are `warning` (surfaced, never blocking).**
  A patch that doesn't parse, has an unclosed fence, contains a malformed
  annotation, or no longer matches the live document is not safe to
  write under any circumstance. A broken link, an anchor to a heading
  that doesn't exist, or content that shrank dramatically are all worth
  a human's attention but are exactly the kind of judgment call the
  brief says a deterministic validator shouldn't unilaterally block on
  (§H: successful validation isn't proof every statement is correct —
  the inverse holds too: a content-quality *heuristic* firing isn't
  proof something is actually wrong).
- **`applyPatch` always re-runs `validatePatch` itself, immediately
  before writing** — never trusts a validation result the caller already
  computed, even when the CLI just printed one a few lines earlier in the
  same process. The file can change on disk between "show the user what
  would happen" and "actually write it" (however small that window is
  locally), and the brief is explicit the staleness check has to guard
  the write itself, not just inform a review screen.
- **"Explicit user approval" is a required `--yes` flag, not an
  interactive prompt.** A live TTY confirmation would need to handle
  non-interactive contexts (CI, scripted runs) as a special case anyway,
  and requiring a flag that must be deliberately passed satisfies "never
  modify the repository until the user explicitly accepts" just as well
  — arguably more legibly, since the approval is visible in the command
  itself rather than an interaction lost to scrollback. `--apply` without
  `--yes` fails fast, before any provider call or file read, rather than
  generating patches nobody asked to have written and then discovering
  the approval is missing.
- **Path safety is checked once, in one place (`resolveSafePath`), and
  every read or write goes through it.** `readDocument` and `applyPatch`'s
  write step both resolve the target against `repoRoot` and refuse
  anything that would land outside it — including via a malicious-looking
  relative link target discovered during link-checking, not just the
  patch's own `documentPath`. A single choke point here matters more than
  it would for a read-only check: this is the one place in the pipeline
  so far that writes to a path derived from pipeline data.
- **Link/anchor checks only cover links introduced or kept by the
  proposed content, checked against the full resulting document (current
  content with the patch spliced in), not the patch's isolated text.** A
  link from the patched section to another section elsewhere in the same
  doc is legitimate and must not be flagged just because that other
  section isn't part of the diff; a pre-existing broken link elsewhere in
  the document isn't this patch's fault to report. Both required
  reconstructing the "what will this document look like after applying"
  view rather than validating the patch text in isolation.

## Key decisions made in Milestone 9

- **`@tracedocs/report` depends on `@tracedocs/core` only — nothing else.**
  `Report`'s `unresolved` sub-fields use inline structural shapes
  (`{ filePath, specifier }`, `{ sourceStableId, targetStableId, edgeType:
  string }`) instead of importing `UnresolvedImport`/`UnresolvedAnnotation`
  from `indexer` or `DanglingReference` from `graph`. TypeScript's
  structural typing means the CLI can pass `indexResult.unresolvedImports`
  straight through without either side needing to import the other's
  types — the smallest possible dependency footprint for a package whose
  entire job is formatting data everyone else already produced.
- **Three renderers, one `Report` object — never three separate code
  paths that each recompute the analysis.** `buildReport` runs once;
  `renderJson`/`renderMarkdown`/`renderAnnotations` are pure functions
  over its output. This is what guarantees the job summary and the inline
  annotations in the GitHub workflow are never out of sync with each
  other — they're two views of one `Report`, not two independent
  analyses that could disagree.
- **Confirmed facts and inferred relationships are visually separated in
  the Markdown output, not just internally typed differently.** The
  "Changed files"/"Changed symbols" sections are headed
  `_(confirmed — from git)_` / `_(confirmed — from static parsing)_`; the
  findings section is headed `_(evidence-based, not proof of
  correctness)_`; proposed patches are headed `_(AI-generated — review
  before applying)_`. Brief §I's "must distinguish confirmed facts from
  inferred relationships" is satisfied by what a reader actually sees on
  the page, not only by the underlying type names.
- **GitHub inline annotations, not a PR comment, are the default
  "advisory annotations" mechanism** (brief's Milestone 9 task list).
  `::warning file=...,line=...::message` workflow commands become
  annotations on the PR's "Files changed" tab for that run automatically
  — no `pull-requests: write` permission needed, unlike posting an actual
  comment via the REST API. `HIGH`-certainty findings become `warning`;
  everything else becomes the quieter `notice`, mirroring the
  certainty-to-visual-weight choice already made for the web explorer's
  path highlighting.
- **The workflow's default job needs only `contents: read` +
  `pull-requests: read`, and the PR-comment alternative is a separate
  job, disabled by default (`if: false`), with its own narrowly-scoped
  `pull-requests: write`** — not a flag on the same job. This makes the
  elevated-permission path impossible to enable accidentally as a side
  effect of some other change to the workflow, and keeps brief §J's
  "should not require write permissions" true of the actual default
  behavior, not just true in the common case.
- **`fetch-depth: 0` (full history) in the example workflow, not a
  minimal shallow fetch.** `tracedocs report` needs to read file content
  at the PR's base commit (via `git show <base>:<path>`, same as
  `change-analyzer` always has), which requires that commit to actually
  be present locally — a shallow checkout of just the PR's commits
  wouldn't include it. Full history is the simplest default that's always
  correct; documented in `docs/github-actions.md` as a place to optimize
  once a repository's checkout time actually matters, rather than
  something to get cleverer about upfront.
- **The checked-in workflow builds TraceDocs from source, not from a
  published package — because there is no published package yet.** It
  analyzes this repository's own pull requests (dogfooding), which is
  honest about what actually exists right now rather than writing a
  workflow that assumes a future `npm install @tracedocs/cli`.
  `docs/github-actions.md` documents exactly what changes once that
  package exists and how another repository adopts this workflow before
  then.

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

**Milestone 4 (graph visualization) is implemented and tested:**

- `@tracedocs/server` — Fastify API in front of `GraphStore`:
  `GET /api/repositories` (list, with counts), `GET /api/repositories/:id`
  (detail + per-type breakdowns), `POST /api/repositories/index` (runs
  `indexRepository` against the server's own graph database),
  `GET /api/repositories/:id/graph` (bounded, type-filterable node/edge
  dump for rendering), `GET /api/repositories/:id/nodes/:nodeId` (detail +
  edges), `GET /api/repositories/:id/nodes/:nodeId/neighbors`
  (bounded-depth traversal), `GET /api/repositories/:id/search`
  (substring search), and `GET /api/repositories/:id/path` (shortest path,
  for highlighting). All inputs validated with Zod; not-found and
  validation failures return structured `{ error: { message } }` JSON with
  the right status code, never a raw exception. `GraphStore` gained
  `listRepositories`/`getRepository`, `countFiles`, `listNodes`/`listEdges`
  (type-filtered, capped), and `searchNodes` to support this.
- `@tracedocs/web` — React + Vite + Cytoscape.js explorer: repository
  picker and "analyze a new folder" form, a dashboard of real counts
  (files/nodes/edges, broken down by type — nothing invented), node-type
  and relationship-type filter checkboxes, a debounced search box, click-
  to-inspect node details (metadata, JSDoc, incoming/outgoing edges),
  "Expand neighbors" (bounded-depth, merges into the current view), a
  From/To path finder that highlights the connecting route in orange, an
  accessible sortable/filterable HTML table as an alternative to the
  canvas, and a plain-language legend/tooltip layer plus a step-by-step
  onboarding panel (added after a user-testing pass on this milestone
  surfaced that raw schema vocabulary — `documentation_section`, `CALLS` —
  and the lack of any first-run guidance were both genuinely confusing).

20 new server tests (route validation, not-found handling, node/edge-type
filtering, dangling-edge exclusion from truncated graphs, search, path
finding including the no-path and cross-repository-node cases) plus 13 new
graph tests for the bulk query methods. Full workspace: 131 tests. The web
package has no automated tests yet — verified via `tsc --noEmit`, a
production `vite build`, and a manual pass (API calls, then a user-testing
round on the actual rendered UI); see the note about automated frontend
testing being a gap to close before Milestone 4 would be called fully done
by the brief's own testing requirements (§13 doesn't enumerate UI tests
explicitly, but "test important behavior" (§18 rule 9) applies here too).

**Milestone 5 (git change analysis) is implemented and tested:**

- `@tracedocs/change-analyzer` — `analyzeChanges(repoRoot, baseRevision,
  targetRevision?)` compares an arbitrary base revision against either
  another arbitrary revision or the current working tree (when
  `targetRevision` is omitted), and returns a `ChangeSet`:
  - **File changes**: added, modified, deleted, renamed — renames via
    git's own `-M` detection (not a delete/add heuristic), untracked new
    files folded in via `git ls-files --others` since plain `git diff`
    against the working tree can't see them.
  - **Symbol changes**: added, removed, modified (matched across
    revisions by kind + qualified name, never by stable id or line
    number, since both change under a rename/move; a matched pair is
    "modified" only when its own source text actually differs), and moved
    (a removed symbol and an added symbol in a *different* file, with
    identical kind, qualified name, *and* source text — never inferred
    from the name alone).
  - Both revisions resolved to full commit SHAs in the result
    (`targetRevision: null` means "the working tree", never a ref string
    that could mean different things at different times).
- CLI: `tracedocs analyze [path] --base <revision> [--target <revision>]`
  prints the file and symbol changes.

16 tests using real temporary git repositories, covering: added/modified/
deleted/renamed files (committed and working-tree cases, including the
documented uncommitted-rename limitation above), a function's parameters
changing, a function's documentation-relevant text staying byte-identical
across an unrelated line shift elsewhere in the file (proving location
lookups aren't line-number-fragile), an added function, a documented
function being deleted, an unrelated file's changes not producing symbol
noise, markdown changes never being reported as symbol changes, a function
moving verbatim between files, and two negative cases pinning down that
neither a matching name alone nor matching content alone is sufficient
evidence for "moved." Full workspace: 147 tests.

**Milestone 6 (documentation impact analysis) is implemented and tested:**

- `@tracedocs/impact-analyzer` — `analyzeImpact(changeSet, store,
  repositoryId, danglingReferences, options?)` produces `ImpactFinding[]`
  using only graph-based retrieval and deterministic rules (brief §F: no
  LLM involved at all yet — that's the explicit requirement for this
  milestone, not a gap). For each `modified` symbol still in the graph:
  bounded traversal (`traverseForDocs`, default `maxDepth: 2`) walks
  outward via incoming `CONTAINS` edges (symbol → class → file),
  checking for an outgoing `DOCUMENTS` edge at every step, and returns
  the *actual* graph path walked — never a fabricated one. For `removed`/
  `moved` symbols (whose graph node no longer exists in the target state):
  matched against `DanglingReference`s captured by the indexer at the
  moment their node was deleted. Certainty (`HIGH`/`MEDIUM`/`LOW`) is
  assigned purely by graph distance; action (`REVIEW`/
  `NEEDS_MORE_INFORMATION`; never a fabricated `NO_ACTION` finding since
  "no relationship found" is correctly just... no finding) additionally
  checks whether the affected doc file was itself also touched in the
  same diff. `PROPOSE_UPDATE` exists in the type but is never assigned —
  reserved for Milestone 7.
- **A real bug was found and fixed in the process**, not just anticipated:
  manually running the new CLI command against a real fixture (not a unit
  test) revealed that a modified-but-identity-preserved documented
  function produced zero findings, because Milestone 3's indexer was
  silently dropping its `DOCUMENTS` edge on reindex whenever only the code
  file (not the doc file) had changed. Fixed in `packages/graph` and
  `packages/indexer` — see the Milestone 6 decisions above for the full
  story and the regression tests added for it.
- CLI: `tracedocs impact <path> --base <revision>` (target is always the
  current working tree — see the decisions above for why an arbitrary
  `--target` isn't supported here).

16 tests in `impact-analyzer` (direct depth-0 relationships, indirect
depth-1/depth-2 relationships, the `maxDepth` bound, no-relationship →
no findings, removed/moved symbols via dangling references, ignoring
non-DOCUMENTS dangling references, the doc-also-changed downgrade to
`NEEDS_MORE_INFORMATION`, and deduplication of one relationship reached
via two paths vs. two genuinely distinct changed symbols sharing one
documented container) plus 4 new tests covering the indexer fix (1
regression test, 3 for the new `GraphStore` method). Full workspace: 167
tests. Manually verified end-to-end against a real fixture repository
(index at base, modify a documented function's parameters, delete a
documented method, run `tracedocs impact` — both correctly surfaced as
`REVIEW` findings with the right evidence).

**Milestone 7 (documentation patch generation) is implemented and tested:**

- `@tracedocs/generator` — `DocumentationProvider` is the vendor-neutral
  interface (`generatePatch(context) => Promise<GenerationResult>`);
  nothing outside this package imports an LLM SDK directly.
  `createMockProvider()` is deterministic and fully offline (three
  configurable behaviors: propose/needsMoreInfo/unavailable), and is both
  the CLI's default provider and what every test in the workspace runs
  against. `createAnthropicProvider()` is the one real adapter (brief:
  "one configurable provider adapter"), using `client.messages.parse()` +
  a Zod schema for guaranteed-structured output, with a system prompt
  that instructs the model to only describe behavior visible in the
  provided code and to return `NEEDS_MORE_INFORMATION` rather than guess.
  `buildGeneratorContext(finding, changeSet)` assembles a bounded context
  per finding (current doc section text, before/after code for the one
  changed symbol) — never the whole repository.
  `generateDocumentationUpdates(findings, changeSet, provider)`
  pre-filters to `REVIEW`-action `modified` findings before ever calling
  the provider.
- CLI: `tracedocs generate <path> --base <revision> [--provider
  mock|anthropic]` prints each outcome (proposed patch with an
  original/proposed diff, or the reason for `NEEDS_MORE_INFORMATION`/
  `PROVIDER_UNAVAILABLE`) — never writes to disk.

15 tests: the mock provider's four behaviors (including the
codeAfter-unavailable → automatic `NEEDS_MORE_INFORMATION` case even in
"propose" mode), context assembly against a real temporary git repo
(before/after code extraction, section-text extraction, page-level
fallback when there's no specific section, and the two `null`-return
cases), the orchestrator's pre-filtering (skips `NEEDS_MORE_INFORMATION`
findings, skips `removed`/`moved` findings, reports
`PROVIDER_UNAVAILABLE` — never silently drops — when context can't be
built) plus one real end-to-end run, and the Anthropic adapter's
pure error-message mapping (no test calls the real API — see the
Milestone 7 decisions above for why). Full workspace: 182 tests.
Manually verified end-to-end against a real fixture repository with the
mock provider (a documented, modified function correctly produced a
`PROPOSED` patch) and the CLI's provider-name validation (an unknown
`--provider` value fails clearly instead of silently falling back).

**Milestone 8 (validation and patch review) is implemented and tested:**

- `@tracedocs/validator` — `validatePatch(patch, repoRoot, options?)` runs
  every deterministic check from brief §H: patch applicability/staleness
  (re-locates the section by heading text in the *current* document and
  compares its exact text against `patch.originalContent`), Markdown
  structure (parses the proposal, checks code-fence balance, checks any
  `tracedocs:` annotations are well-formed), broken internal links and
  invalid anchors (checked against the full resulting document, not the
  patch text in isolation, so a link to another section of the same doc
  isn't wrongly flagged), an accidental-deletion heuristic (a dramatic,
  unexplained size shrink), and — when a `GraphStore` is supplied —
  annotation-target resolution against the live graph. Structural issues
  are `error` (block applying); link/anchor/deletion-heuristic issues are
  `warning` (surfaced, never blocking, since successful validation was
  never claimed to prove correctness). `applyPatch(patch, repoRoot,
  options?)` always re-validates immediately before writing and never
  writes anything if that re-validation fails; every path write goes
  through `resolveSafePath`, refusing anything that would escape the
  repository root.
- CLI: `tracedocs generate` now validates every `PROPOSED` patch and
  prints the results; `--apply` (which requires `--yes`, checked before
  any work starts) writes valid, non-stale patches to disk and reports
  exactly what happened to each one — applied, or why not.

45 tests: section re-location (page-level, by heading, heading no longer
found), applicability (matches / doc unreadable / section gone / stale
text), structure (well-formed / unclosed fence / malformed annotation),
links and anchors (valid anchor across sections, invalid anchor, valid
relative link, broken relative link, a path-traversal attempt, external
links always skipped), the accidental-deletion heuristic (flags a
drastic shrink, doesn't flag a reasonable edit or short content or
growth), annotation-target resolution (resolves / unresolved / ambiguous
/ skips already-malformed annotations), the `validatePatch` orchestrator
(valid patch, stale patch, unclosed fence, `checksNotPerformed` populated
correctly for both the no-graph-store and section-not-found cases), and
`applyPatch` (writes correctly while preserving untouched content,
refuses and leaves the file untouched for a stale patch/invalid proposal/
path-escaping document path, and is idempotent — a second `apply` call
against its own output correctly reports the patch as now stale). Full
workspace: 220 tests. A real bug was caught immediately by the first test
run (not left to manual testing this time): a hand-written "well-formed"
test fixture had its opening code fence on the same line as prose text,
which isn't valid Markdown fence syntax — the fence-balance check
correctly flagged it as unclosed; the test fixture was wrong, not the
checker. Manually verified end-to-end against a real fixture repository:
dry-run printing a diff and a `valid` validation result, `--apply`
without `--yes` failing fast with a clear message, `--apply --yes`
correctly writing the file while preserving unrelated content, and a
subsequent run correctly finding nothing left to flag once the
underlying finding was resolved.

**Milestone 9 (GitHub Actions integration) is implemented and tested:**

- `@tracedocs/report` — `buildReport(input)` assembles a `Report` from a
  `ChangeSet`, `ImpactFinding[]`, unresolved-items data, and optionally
  `ReportProposedPatchEntry[]` (patches + their validation, only when
  generation was requested). `renderJson`/`renderMarkdown`/
  `renderAnnotations` are pure functions over that one `Report` object —
  the three output formats can never disagree with each other because
  they're views of the same data, not three independent analyses.
  `renderMarkdown` visually separates confirmed facts (file/symbol
  changes) from evidence-based inference (findings) from AI output
  (proposed patches), each section explicitly labeled as such.
  `renderAnnotations` emits GitHub workflow commands
  (`::warning file=...,line=...::message` / `::notice ...`) that become
  inline PR annotations without any write permission.
- CLI: `tracedocs report <path> --base <revision> [--target <revision>]
  [--format markdown|json|annotations] [--out <file>] [--provider
  mock|anthropic]` — advisory only (always exits 0 once analysis
  completes; this is a report, not a pass/fail gate).
- `.github/workflows/tracedocs.yml` — a real, working workflow in this
  repository (not just a template) that runs on every pull request:
  checks out full history (needed to read file content at the PR's base
  commit), builds TraceDocs, writes the Markdown report to the job
  summary, and emits inline annotations — using only `contents: read` +
  `pull-requests: read`. A second job posts the report as an actual PR
  comment instead, disabled by default (`if: false`) with its own
  separately-scoped `pull-requests: write`, exactly matching brief §J's
  "keep write access opt-in and narrowly scoped."
  `docs/github-actions.md` documents the minimum permissions, the setup
  process, and how another repository would adopt this today (build from
  source) versus once TraceDocs is published as a package.

23 new tests in `@tracedocs/report` (summary aggregation by action and
certainty, JSON round-tripping, every Markdown section's presence/absence
logic including the no-findings and no-unresolved-items cases, a
PROPOSED-vs-NEEDS_MORE_INFORMATION patch rendering distinction, and the
annotation renderer's escaping/level/line-range logic). Two test-authoring
mistakes were caught and fixed by the test run itself, not left
undiagnosed: an assertion that expected spaces and parentheses to be
percent-escaped in a workflow-command property (only `%`, CR, LF, `,`,
and `:` actually need it per GitHub's own rules) and a diff-rendering
assertion missing the space after `-`/`+` that the renderer actually
emits. Full workspace: 243 tests. Manually verified end-to-end against a
real fixture repository in all three formats (`markdown`, `json` via
`--out`, and `annotations`), plus the CLI's format/provider validation
rejecting bad input before doing any work.

**Not yet implemented:** persisted analysis runs/findings/patches (see
the Milestone 8 decisions above for the schema issue driving that
deferral — `tracedocs report`'s output is not currently stored anywhere
between invocations); a published `@tracedocs/cli` package (the workflow
builds from source for now); and the non-goal features explicitly out of
this project's scope per brief §15 (auto-merge, automatic PR creation,
etc.). Within graph scope specifically:
`TESTS`/`REFERENCES`/`CONFIGURES`/`EXPOSES`/`LINKS_TO` edge types and
`api_endpoint`/`configuration_item`/`test`/`code_example` node types exist
in the brief's model but nothing populates them yet — see the
`GraphNodeType`/`GraphEdgeType` unions in `packages/core/src/graph-types.ts`
for exactly what's live. Within change-analysis scope: no dedicated
export-list diffing beyond what symbol-level diffing already surfaces (see
Milestone 5 decisions above), and route/configuration-declaration changes
aren't detected since those aren't extracted as symbols at all yet. Within
impact-analysis scope specifically: no semantic/lexical retrieval and no
LLM-assisted relevance assessment (brief §F explicitly defers both until
after this deterministic baseline — which now exists and is tested); no
use of `unresolvedAnnotations` as impact-analysis input (that's a data-
quality signal surfaced separately by `tracedocs index`, not folded into
"what does this specific change affect"); and `removed`/`moved` findings
don't attempt bounded traversal from the symbol's former container (see
decisions above). See the milestone list in the project brief for
sequencing.
