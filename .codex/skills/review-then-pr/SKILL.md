---
name: review-then-pr
description: Gate local publication on a review pass. Use when Codex should inspect the current branch, diff, staged changes, or working tree with `code-review-triad` first, and only when that review returns zero actionable findings continue to branch setup, commit, push, and GitHub pull request creation.
---

# Review Then PR

## Overview

Run a review-first publish workflow.
Use `code-review-triad` as the gate. If it returns any actionable finding, stop and report it. If it returns no findings, publish the reviewed change as a PR.

## Workflow

1. Define the publish scope.
2. Review that exact scope with `code-review-triad`.
3. Stop immediately when the review finds anything actionable.
4. Publish only the reviewed scope when the finding set is empty.

## Step 1: Define Scope

Inspect local git state before reviewing or publishing.

Prefer the smallest real artifact:
- current branch diff against base branch
- staged diff when the user is clearly preparing a commit
- explicit file list when the worktree is mixed
- an existing PR diff when the user points at a PR

Do not silently widen scope from a small requested change to the whole repository.
Do not stage unrelated user changes.

## Step 2: Run The Review Gate

Invoke `code-review-triad` on the exact artifact chosen in Step 1.

Keep the normal review contract:
- prioritize actionable findings over summary
- verify any claimed issue against the source before repeating it
- treat "no findings" as "no actionable findings found in the reviewed scope"
- mention meaningful test or validation gaps even when no findings exist

If any actionable finding exists, stop after reporting it. Do not commit, push, or open a PR.

## Step 3: Publish Only When Clean

When the review returns zero actionable findings, switch to the publish flow.

Prefer using `yeet` for the publish phase when that skill is available. Otherwise follow the same behavior directly:
- create or keep the branch according to the current branch strategy
- stage only the reviewed files
- write a focused commit
- run the most relevant checks for the touched code if they have not been run yet
- push the branch
- open a draft PR unless the user explicitly asked for a ready-for-review PR

Base the PR body on the reviewed change, not on the whole worktree.
State clearly that the change passed the review gate with no actionable findings.

## Stop Conditions

Stop and ask or report instead of publishing when:
- the review found issues
- the worktree contains unrelated changes and scope is ambiguous
- the repository remote or GitHub authentication is not ready
- required tests fail
- the requested publish target is ambiguous

## Output Contract

When findings exist, return:
1. findings ordered by severity
2. open questions or assumptions when they affect confidence
3. no publish actions taken

When no findings exist and publish succeeds, return:
1. explicit statement that the review gate found no actionable issues
2. branch, commit, and PR result
3. checks that were run
4. any residual risk or missing validation worth noting

## Safety

Never bypass the review gate.
Never publish changes that were not part of the reviewed artifact.
Never convert "no major issues" into "no findings"; the publish path requires zero actionable findings.
