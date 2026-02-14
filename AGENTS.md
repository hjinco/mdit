# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React + TypeScript frontend.
  - `src/components/`, `src/ui/`, `src/hooks/`, `src/contexts/`, `src/store/`, `src/services/` hold UI, state, and app logic.
  - `src/db/` and `src/repositories/` hold data access and persistence utilities.
- `src-tauri/` contains the Rust/Tauri desktop backend.
- `public/` stores static assets copied as-is into the build.
- `dist/` and `target/` are build outputs (frontend and Rust).
- Tests live alongside code, e.g. `src/**/**.test.ts`, plus Rust tests under `src-tauri/src/**/tests.rs`.

## Build, Test, and Development Commands
- `pnpm dev` runs the Vite dev server.
- `pnpm build` typechecks and builds the frontend bundle.
- `pnpm preview` serves the production build locally.
- `pnpm tauri build` builds the full desktop app (frontend + Rust).
- `pnpm test` runs Vitest in CI mode.
- `pnpm ts:check` runs TypeScript type checks only.
- `pnpm lint` runs Biome checks; `pnpm lint:fix` auto-fixes.

## Coding Style & Naming Conventions
- Use 2-space indentation and single quotes in TS/TSX (match existing files).
- Keep files and folders in kebab-case; React components in PascalCase.
- Prefer colocating tests with their modules using `*.test.ts`.
- Format and lint with Biome before pushing (`pnpm lint`).

## Testing Guidelines
- Frontend tests use Vitest; name files `*.test.ts` and keep fixtures small.
- Rust tests live in `src-tauri` and are standard Rust `#[test]` functions.
- Run `pnpm test` for JS/TS, and `cargo test` from `src-tauri/` when touching Rust.

## Commit & Pull Request Guidelines
- Commits follow a Conventional Commits style: `feat:`, `fix:`, `refactor:`, `chore:`, `ui:`, `ux:` (e.g., `fix: add overflow handling`).
- Keep commits scoped and descriptive; include issue/PR numbers when relevant.
- PRs should include a short summary, testing notes, and screenshots/GIFs for UI changes.
- Link related issues and note any migration or data-impacting changes.

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
