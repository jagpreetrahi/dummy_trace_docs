# GitHub Actions setup

TraceDocs ships a workflow at
[`.github/workflows/tracedocs.yml`](../.github/workflows/tracedocs.yml)
that analyzes documentation impact on every pull request. This page
documents what it does, exactly what permissions it needs and why, and
how to adopt it in another repository.

## What it does

On `pull_request` (opened, updated, or reopened), the `report` job:

1. Checks out the PR with full history (`fetch-depth: 0`) — `tracedocs
   report` needs to read file content at the PR's base commit, not just
   diff against it, so the base commit must actually be present locally.
2. Installs and builds TraceDocs from source (see [Adopting this in
   another repository](#adopting-this-in-another-repository) for why).
3. Runs `tracedocs report --base <PR base SHA> --format markdown` and
   appends the output to the job summary (`$GITHUB_STEP_SUMMARY`) — visible
   on the workflow run's page, no repository or PR write access involved.
4. Runs the same analysis again with `--format annotations`, printing
   GitHub workflow commands (`::warning file=...,line=...::message`).
   GitHub turns these into inline annotations on the PR's "Files changed"
   tab for this run automatically — also no write access involved.

Both outputs come from the same underlying report; running it twice (once
per format) is simpler and more transparent than trying to derive one
format from the other's already-formatted text, at the cost of one extra,
fast, local analysis pass.

## Minimum required permissions

```yaml
permissions:
  contents: read
  pull-requests: read
```

That's everything the default `report` job needs. Neither the job summary
nor inline annotations require `pull-requests: write` or `contents:
write` — this is intentional (brief §J: "the initial implementation
should not require write permissions to the repository") and is the
whole reason those two output channels were chosen as the defaults
instead of posting a PR comment.

`pull-requests: read` specifically enables the checkout action to read PR
metadata (like the base SHA used above) when triggered by `pull_request`;
it is not needed for the report generation itself.

## The optional PR-comment job

The workflow also defines a `comment` job that posts the Markdown report
as an actual PR comment instead of (or alongside) the job summary. It is
**disabled by default** (`if: false`) and requires `pull-requests: write`
— scoped to that job alone, not the whole workflow, so enabling it never
grants write access to anything else the workflow does.

To enable it:

1. Change `if: false` to `if: true` on the `comment` job.
2. Leave its own `permissions: pull-requests: write` block as-is (or trim
   further if you don't need `contents: read` there — checkout still does).
3. Consider whether you want both jobs running (summary + comment) or
   just the comment job, and delete the other if not.

This mirrors the brief's broader rule for anything that writes to a
repository or PR: opt-in, narrowly scoped, separate from the advisory
default — the same principle applies to the (not yet built) idea of
TraceDocs opening its own documentation PRs, which would need its own,
even more narrowly scoped permission configuration and is out of scope
for this milestone.

## Adopting this in another repository

The workflow as checked in builds TraceDocs from source (`pnpm install` +
`pnpm run build` inside the TraceDocs monorepo) because this file lives
*in* the TraceDocs repository and analyzes TraceDocs' own pull requests —
there's no published package to install yet. To use TraceDocs in a
different repository today, copy this workflow file in and replace the
"Install dependencies" / "Build TraceDocs" steps with a step that checks
out or installs TraceDocs from wherever you're building it from (e.g. a
git submodule, a separate checkout step pointed at this repository, or a
private package registry), then point the `report`/annotation commands at
that installed CLI instead of `packages/cli/dist/index.js`.

Once TraceDocs is published as an npm package, adopting it will be as
simple as replacing those two steps with:

```yaml
- run: npx @tracedocs/cli report . --base "${{ github.event.pull_request.base.sha }}" --format markdown >> "$GITHUB_STEP_SUMMARY"
```

and dropping the checkout-and-build steps for TraceDocs itself entirely
(you'd still check out *your own* repository, just not build TraceDocs
from source). This isn't done yet — see `docs/architecture.md`'s Not Yet
Implemented notes.

## Why full-history checkout, not a shallow one

`fetch-depth: 0` fetches the entire git history, which is more than
strictly necessary — only the base commit's tree needs to be reachable.
A shallower `fetch-depth` (e.g. large enough to cover the PR's commit
count, or an explicit `git fetch origin <base-sha>` step) would work too
and would be faster for large repositories with long histories. Full
history is the simpler, always-correct default for a template most
repositories will start from; tune it down once you know your repository
and PR sizes if checkout time becomes a concern.
