# Lessons Learned: Bugs Found and Key Decisions (Milestones 1–6)

This is a retrospective, not a design doc — `docs/architecture.md` has the
full rationale for every decision mentioned here and is the source of
truth if the two ever disagree. This file exists to answer two questions
plainly: *what actually broke, and how did we know?* and *what did we
deliberately choose, and why that instead of the obvious alternative?*

Every bug below is real — found by a failing test or by actually running
the tool, not hypothesized in advance. None were left "fixed and
forgotten": each has a regression test.

---

## Real bugs found and fixed

### 1. `this.method()` calls weren't recognized as calls (Milestone 2)

**What happened:** `parser-ts`'s call-extraction only treated a plain
identifier or a chain of property accesses on one as a "statically
identifiable" callee. `this.persist()` inside a method didn't match,
because `this` is a `ThisExpression` node, not an `Identifier` — so calls
made through `this.` were silently dropped instead of attributed to the
enclosing method.

**How we found it:** A test written directly from the brief's own
scenario ("a class with methods that call each other") failed:
`attributes a call inside a method to that method`.

**Fix:** `packages/parser-ts/src/calls.ts` — `isSimpleCalleeExpression`
now also accepts `ts.SyntaxKind.ThisKeyword` as a valid base case.

---

### 2. `node:sqlite` wasn't recognized by Vite/Vitest's module resolution (Milestone 3)

**What happened:** `node:sqlite` is a very new Node builtin. The Vite
version bundled with Vitest 2.1.9 didn't have it in its hardcoded builtin
list, so it tried to resolve `node:sqlite` as an ordinary package named
`sqlite` — which doesn't exist in `node_modules` — and every test file
that touched the graph package failed to even load.

**How we found it:** Every graph-package test failed immediately with
`Failed to load url sqlite (resolved id: sqlite)`.

**Fix:** Upgraded `vitest`/`@vitest/coverage-v8` from `^2.1.5` to
`^3.2.4` workspace-wide (a newer bundled Vite recognizes it natively). As
a side effect, this also surfaced (and let us fix) a deprecation warning
for the old `vitest.workspace.ts` format, replaced with `test.projects`
in a root `vitest.config.ts`.

---

### 3. Malformed annotations were silently skipped instead of reported (Milestone 3)

**What happened:** `buildAnnotationEdges` had `if (annotation.directive
!== 'documents') continue;` *before* the well-formedness check. Since an
unknown directive is exactly what makes an annotation not well-formed,
this early `continue` meant malformed annotations with an unrecognized
directive (e.g. `<!-- tracedocs:frobnicate ... -->`) were dropped without
ever being counted as unresolved — the opposite of the intended behavior.

**How we found it:** Test `reports a malformed annotation (unknown
directive) as unresolved` failed: expected length 1, got 0.

**Fix:** Removed the premature directive check; the existing
`wellFormed` check (which parser-md already sets to `false` for unknown
directives) is the single source of truth.

---

### 4. A TypeScript generic-inference bug broke Zod schemas with `.default()` (Milestone 4)

**What happened:** A validation helper typed its schema parameter as
`ZodSchema<T>` — an alias that pins `Input = Output = T`. Every query
schema in the server has at least one `.default()`d field, where Input
(before defaults) and Output (after) genuinely differ, so `tsc -b` failed
across every route file.

**How we found it:** Build errors, not test failures — `tsc -b` refused
to compile.

**Fix:** `packages/server/src/validate.ts` — retyped the parameter as
`z.ZodType<T, z.ZodTypeDef, unknown>`, which only constrains the Output
type and stops forcing Input to match it.

---

### 5. Checkbox filters inverted on the first uncheck (Milestone 4)

**What happened:** The node/edge type filter checkboxes used "empty
selection set = show everything" so the UI didn't need to send redundant
query params. But that makes an *unchecked* box and a *fully-checked* set
look identical (both are backed by an empty `Set`), so clicking to
uncheck one box from "all checked" added that single type back as the
*only* selected type instead of excluding it — the toggle's direction
was ambiguous by construction.

**How we found it:** Caught by re-reading the logic while implementing,
before it ever reached a user — the "empty means all" shortcut was a
premature optimization that introduced real ambiguity.

**Fix:** Filter state now always holds the literal set of checked types,
initialized to the full set (everything checked by default); toggling is
a plain add/remove with no special-cased empty state.

---

### 6. `git diff <base>` (no target) doesn't see brand-new untracked files (Milestone 5)

**What happened:** `getChangedFiles` wrapped `git diff --name-status -M
base`, which only diffs what git already tracks. A file that was written
to disk but never `git add`ed is invisible to it — so "analyze what
changed since revision X" silently missed every new file that hadn't
been staged yet.

**How we found it:** Test `detects an added file against the working
tree` failed — the result was an empty change set for a repo with an
obviously new file.

**Fix:** `packages/change-analyzer/src/gitDiff.ts` — when comparing
against the working tree (no explicit target), also runs `git ls-files
--others --exclude-standard` and unions the untracked paths in as
`added`.

---

### 7. An uncommitted rename can't be told apart from delete+add (Milestone 5)

**What happened:** Not a bug in our code — a real property of git. Git's
rename detection (`-M`) compares blob similarity between two committed
(or staged) trees. A file that's renamed on disk without ever being
staged gives git nothing to correlate: the old path looks deleted, the
new path looks like an untracked addition, and there is no way to
distinguish that from an unrelated delete-and-add using `git diff`
alone.

**How we found it:** The original rename test used two uncommitted
files and failed — expected a `renamed` entry, got separate `deleted`
and `added` entries.

**Resolution:** Not "fixed" (there's nothing to fix — it's a genuine git
limitation), but made correct and explicit: the rename test now commits
both sides (where git's detection is well-defined and does work), and a
second test pins down and documents the uncommitted case as expected
behavior, not a silent gap.

---

### 8. A modified symbol silently lost its documentation link on reindex (Milestone 6) — the big one

**What happened:** The indexer's incremental strategy (Milestone 3) is
"delete every node a changed file contributed, then reinsert fresh ones"
— simpler than diffing old vs. new symbols, and correct for the cases it
was tested against at the time. But it deletes *all* of a file's edges
unconditionally, even for a symbol whose identity (stable id) didn't
change — only its body did. The `DOCUMENTS` edge from a maintainer
annotation is only re-created when the *documentation* file itself gets
reprocessed in the same run. If only the code changed, the doc file
never re-runs its annotation resolution, so the edge just vanished —
silently, with no error and no dangling-reference report, because from
the indexer's point of view nothing was "deleted," it just never got
reconnected.

**How we found it:** Not by a unit test — by manually running the new
`tracedocs impact` command end-to-end against a real fixture repository
with a documented, modified function. It produced **zero** findings for
a clearly-relevant, clearly-documented change. Every impact-analyzer unit
test passed the whole time, because they each seeded the graph directly
and never exercised a second `indexRepository` call the way the real CLI
workflow does.

**Fix:** Two changes, in the layer where the problem actually lives:
- `GraphStore.findDocumentationFilesReferencing(repositoryId, filePath)`
  (`packages/graph`) — a new read-only query: which doc files currently
  have a `DOCUMENTS` edge from something in this file?
- `indexRepository` (`packages/indexer`) now calls this, before deleting
  anything, for every code file about to be reprocessed, and folds any
  referencing doc files into the same run's file set — so their
  annotations get correctly re-resolved against the fresh nodes instead
  of just losing the edge.

Covered by a regression test (`indexer/test/markdownAndAnnotations.test.ts`:
*"keeps the DOCUMENTS edge when the documented code changes but the doc
file does not"*) plus three new direct tests of the `GraphStore` method.
Re-ran the exact manual scenario that surfaced it — now correctly
produces a `REVIEW` finding.

---

## Key decisions and what we weighed

Grouped by theme; see `docs/architecture.md`'s per-milestone "Key
decisions" sections for the full reasoning behind each.

**Avoiding native build dependencies (a recurring theme, not a one-off):**
- Tree-sitter (brief's suggestion for JS/TS parsing) needs native
  bindings (`node-gyp`, a C toolchain) — flagged as a Windows risk in
  Milestone 0 and avoided by using the TypeScript Compiler API instead,
  which is pure JS/TS and happens to be the same parser `tsc` itself
  uses.
- `better-sqlite3` (the common SQLite choice) has the same native-binding
  profile — avoided the same way, using Node's built-in `node:sqlite`
  instead. Same risk class, same mitigation, applied a second time
  independently — worth noticing as a pattern, not a coincidence.

**Correctness over convenience in the indexer:**
- Delete-and-reinsert per changed file (rather than diffing old vs. new
  symbols in place) is simpler and was the right call — but its exact
  blind spot is what caused bug #8 above. The fix expanded *which files*
  get reprocessed, not the delete-and-reinsert strategy itself, which is
  still the right shape.
- Evidence type is part of the edge uniqueness key (not just a column),
  specifically so a future weaker AI-inferred relationship can never
  silently overwrite a stronger static-analysis or explicit-annotation
  one — decided in Milestone 3, before any AI-inferred edges existed, so
  it would already be structurally impossible to get wrong later.
- Stable ids are built from repo-relative path + qualified name + kind —
  never from line numbers, which move. This one design rule is what made
  move/rename detection (Milestone 5) and containment traversal
  (Milestone 6) both work without extra bookkeeping.

**Deterministic before AI, all the way through:**
- Milestones 3–6 (graph, visualization, change analysis, impact
  analysis) are entirely rule-based — no LLM call anywhere in the
  pipeline yet. This wasn't an accident of sequencing; the brief requires
  a deterministic baseline before any LLM-assisted step, and every
  "confidence" label (`HIGH`/`MEDIUM`/`LOW`) assigned so far comes from a
  documented, testable rule (graph distance, evidence type), never a
  model's self-reported certainty.
- `PROPOSE_UPDATE` exists in the `ImpactAction` type since Milestone 6
  but nothing has assigned it — reserved until Milestone 7's generator
  can actually accompany a finding with a real patch. Adding it earlier
  "for completeness" would have meant a code path that claims a
  capability that doesn't exist yet.

**Where package boundaries mattered:**
- `change-analyzer` and `impact-analyzer` both depend only on `core` and
  `graph` (or nothing at all, for `change-analyzer`) — never on each
  other or on `indexer`. Each is a pure function of data, not of another
  package's internals, which is what made both fast to test (no git
  repos needed for `impact-analyzer`'s own tests) and easy to reason
  about independently.
- The CLI's `impact` command only ever compares `--base` against the
  current working tree, never an arbitrary `--target` — because
  `indexRepository` can only ever reflect what's actually on disk, and
  auto-checking-out a revision as a side effect of an "analyze" command
  would mutate the user's working directory, which is exactly the kind
  of action this project's own trust-boundary rules (brief §12) rule
  out.

---

## Patterns worth carrying into Milestone 7 and beyond

- **Tests written directly from the brief's own scenarios caught nearly
  every bug above.** Bugs #1, #3, #6, and #7 were all found by a test
  that was simply "does this match the exact scenario the brief
  describes" — not fuzzing, not exhaustive case generation. Scoping
  Milestone 7's tests the same way (start from brief §13's "an AI
  provider is unavailable" case, for instance) is the highest-value
  starting point.
- **The most consequential bug (#8) was invisible to unit tests and
  visible in about thirty seconds of manually running the real command.**
  Every layer was individually well-tested; the bug lived in how two
  correct layers composed across a *second* call that no unit test
  happened to make. This is a structural limit of unit testing, not a
  gap in test quality — worth deliberately running the real CLI/API end
  to end after wiring each milestone together, not just trusting green
  test suites.
- **A few "bugs" were actually honest scope boundaries once we looked
  closely** (bug #7's uncommitted renames; `PROPOSE_UPDATE`'s
  no-op status). The useful move in both cases was documenting the
  limitation precisely and testing *that* it behaves as documented,
  rather than either quietly shipping a false guarantee or over-building
  a fix for a case that may not matter (e.g. auto-staging files just to
  make rename detection work against the working tree).
