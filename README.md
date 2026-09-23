# TraceDocs

A documentation intelligence and synchronization system: it builds a
dependency graph between source code and documentation, detects when a code
change may have made documentation stale, and proposes reviewable,
evidence-backed fixes. It never auto-merges generated documentation.

See [`docs/architecture.md`](docs/architecture.md) for the system design and
current implementation status.

## Status

Early, incremental build. **Implemented so far: Milestone 1 — repository
scanning.** Parsing, the dependency graph, change/impact analysis,
generation, validation, the UI, and GitHub integration are not built yet.

## Requirements

- Node.js >= 20
- pnpm (`corepack enable` or `npm i -g pnpm`)
- git

## Setup

```sh
pnpm install
pnpm run build
pnpm test
```

## Usage (current)

Index a repository (discovers `.ts/.tsx/.js/.jsx/.md/.mdx` files, respects
`.gitignore`, records the current git revision, and reports what changed
since the last run):

```sh
node packages/cli/dist/index.js index <path-to-repo>
```

This writes `.tracedocs/manifest.json` inside the scanned repository so the
next run can report added/modified/removed/unchanged files. That directory
is safe to delete — it will be rebuilt on the next `index` run.

## Development

```sh
pnpm test          # run all tests once
pnpm run test:watch
pnpm run lint
pnpm run typecheck # builds project references and reports type errors
```

## Packages

| Package | Purpose |
|---|---|
| `@tracedocs/core` | Shared types |
| `@tracedocs/scanner` | Repository discovery, git revision, content hashing |
| `@tracedocs/cli` | `tracedocs` command line entry point |

More packages (`parser-ts`, `parser-md`, `graph`, `change-analyzer`,
`impact-analyzer`, `generator`, `validator`, `server`, `web`) are added as
their milestones land.
