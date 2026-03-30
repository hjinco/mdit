---
name: code-review-triad
description: Run a multi-agent code review that splits analysis into three parallel passes: bugs, maintenance, and security. Use when the user asks for a code review, PR review, patch review, diff inspection, or risk assessment and wants deeper coverage than a single pass, especially for changed files, pull requests, or non-trivial refactors.
---

# Code Review Triad

Use three subagents in parallel, each with a narrow review mandate, then synthesize one final review.

## Review Contract

Treat the task as a review by default.
Prioritize findings over summaries.
Report concrete bugs, regressions, maintainability problems, and security risks.
Reference exact files and lines when possible.
Keep the final answer concise and ordered by severity.

If there are no findings, say so explicitly and mention any residual testing gaps or assumptions.

## Parallel Passes

Launch exactly three subagents when subagents are available. Use `explorer` agents unless the task clearly needs a stronger general-purpose reviewer.

Give each subagent only the task, changed artifact, and review scope. Do not leak your own conclusions.

### 1. Bug Reviewer

Focus on:
- functional correctness
- logic regressions
- edge cases
- broken invariants
- missing or misleading tests

Prompt shape:

```text
Review this change for bugs and behavioral regressions only. Ignore style. Look for incorrect logic, broken edge cases, invalid assumptions, and missing test coverage that would hide a bug. Return only concrete findings with severity, file, line, and short rationale.
```

### 2. Maintenance Reviewer

Focus on:
- readability that meaningfully affects future changes
- brittle abstractions
- tight coupling
- duplicated logic
- poor API boundaries
- confusing naming when it can cause future defects
- missing tests that hurt maintainability

Prompt shape:

```text
Review this change for maintainability risks only. Ignore style nits unless they create real future cost. Look for brittle abstractions, duplication, unclear ownership, poor boundaries, and test gaps that will make future changes unsafe. Return only concrete findings with severity, file, line, and short rationale.
```

### 3. Security Reviewer

Focus on:
- auth and permission boundaries
- secret handling
- injection vectors
- unsafe shell, SQL, path, or HTML handling
- deserialization and trust boundaries
- data leakage
- unsafe defaults

Prompt shape:

```text
Review this change for security risks only. Ignore generic advice. Look for realistic vulnerabilities, boundary violations, unsafe input handling, data exposure, and insecure defaults. Return only concrete findings with severity, file, line, and short rationale.
```

## Context To Pass

Prefer the smallest artifact that still supports a real review:

- For a PR review: pass the patch, changed file list, and any relevant surrounding files you inspect locally.
- For a local review: pass the diff or changed files plus focused context reads.
- For a single file review: pass that file and any immediate dependencies needed to understand behavior.

Do not ask subagents to review the whole repository unless the user explicitly asks for that scope.

## Synthesis

After all three passes return:

1. Verify each finding against the source before repeating it.
2. Merge duplicates across agents.
3. Keep only actionable findings.
4. Order by severity, then by certainty.
5. Prefer bugs and security issues over softer maintenance concerns when space is limited.

Use this output shape:

1. Findings first, each with severity, path, line, and impact.
2. Open questions or assumptions if they materially affect confidence.
3. Very short summary only after findings.

## Severity Guidance

- High: likely production bug, exploitable security issue, or major regression
- Medium: realistic defect risk, important maintainability trap, or missing protection around sensitive behavior
- Low: non-trivial but lower-impact issue worth fixing soon

Do not inflate severity for stylistic concerns.

## Fallback

If subagents are unavailable, emulate the same workflow locally in three explicit passes:

1. Bug pass
2. Maintenance pass
3. Security pass

Keep the scopes separate during analysis, then synthesize once at the end.
