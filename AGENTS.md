# Repository Guidelines

## Project Structure & Module Organization
- This is a pnpm workspace monorepo. The desktop app lives in `apps/desktop/`.
- `apps/desktop/src/` contains the React + TypeScript frontend.
- `apps/desktop/src-tauri/` contains the Rust/Tauri app adapter layer (window lifecycle, plugin wiring, command registration).
- Rust core logic is split into workspace crates under `crates/`:

## Build, Test, and Development Commands
- Run commands from the monorepo root unless noted. Root `desktop:*` scripts delegate to `apps/desktop`.
- `pnpm desktop:tauri build` (or `pnpm -C apps/desktop tauri build`) builds the full desktop app (frontend + Rust).
- `pnpm desktop:test` (or `pnpm -C apps/desktop test`) runs Vitest in CI mode.
- `pnpm desktop:test:rust` (or `pnpm -C apps/desktop test:rust`) runs `cargo test --workspace --manifest-path ../../Cargo.toml`.
- `pnpm desktop:ts:check` (or `pnpm -C apps/desktop ts:check`) runs TypeScript type checks only.
- `pnpm lint` runs Biome checks; `pnpm lint:fix` auto-fixes.

## Prerequisites & Configuration
- Requires Node.js (latest LTS), pnpm, and a Rust toolchain for Tauri.
- Store API keys or local model config outside the repo (env/local settings).

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
