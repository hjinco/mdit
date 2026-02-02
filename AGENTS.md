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
- `pnpm db:generate` generates Drizzle ORM migrations.

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
