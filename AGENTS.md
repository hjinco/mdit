# Repository Guidelines

## Build, Test, and Development Commands
- Run commands from the monorepo root unless noted. Root scripts use `task:scope` names.
- `pnpm test:desktop` runs `turbo run test --filter=@mdit/desktop`.
- `pnpm test:sync` runs `turbo run test --filter=@mdit/sync`.
- `pnpm test:packages` runs `turbo run test --filter='./packages/*'`.
- `pnpm test:all` runs `turbo run test`.
- `pnpm check:rust:all` runs `cargo check --workspace --manifest-path Cargo.toml --locked`.
- `pnpm test:rust:all` runs `cargo test --workspace --manifest-path Cargo.toml --locked`.
- `pnpm test:rust:core` runs `cargo test --workspace --manifest-path Cargo.toml --exclude mdit --locked`.
- `pnpm ts:check:desktop` runs `turbo run ts:check --filter=@mdit/desktop`.
- `pnpm ts:check:www` runs `turbo run ts:check --filter=@mdit/www`.
- `pnpm ts:check:sync` runs `turbo run ts:check --filter=@mdit/sync`.
- `pnpm ts:check:all` runs `turbo run ts:check`.

- After changing TypeScript code, run `pnpm lint:fix`.
- After changing Rust code, run `cargo fmt --all --manifest-path Cargo.toml`.

## LLM Working Principles
Behavioral guidelines to reduce common LLM coding mistakes. These rules complement the project-specific instructions above.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of silently choosing one.
- If a simpler approach exists, call it out. Push back when warranted.
- If something is unclear, stop and ask for clarification.

### 2. Simplicity First
**Use the minimum code that solves the problem. Nothing speculative.**

- Do not add features beyond the request.
- Avoid abstractions for single-use code.
- Avoid extra flexibility/configurability that was not requested.
- Avoid defensive handling for scenarios that cannot occur in context.
- If implementation size feels disproportionate, simplify.

Check: "Would a senior engineer consider this overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what is necessary. Clean up only what your changes affect.**

When editing existing code:
- Do not improve unrelated adjacent code, comments, or formatting.
- Do not refactor code that is not part of the requested fix.
- Match existing style and patterns in this codebase.
- If unrelated dead code is noticed, mention it; do not remove it unless asked.

When your changes introduce orphans:
- Remove imports/variables/functions made unused by your own edits.
- Do not remove unrelated pre-existing dead code unless requested.

Test: Every changed line should map directly to the request.

### 4. Goal-Driven Execution
**Define success criteria and verify until done.**

Turn tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass."
- "Fix the bug" -> "Write a failing test that reproduces it, then make it pass."
- "Refactor X" -> "Ensure behavior/tests pass before and after."

For multi-step tasks, use a short verification plan:
```txt
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong criteria enable independent execution. Weak criteria ("make it work") require repeated clarification.
