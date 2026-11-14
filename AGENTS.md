# Repository Guidelines

## Build, Test, and Development Commands
- Run commands from the monorepo root unless noted. Root scripts use `task:scope` names.
- `pnpm dev:desktop` runs the GPUI app (`cargo run -p mdit-desktop --locked`).
- `pnpm dev:legacy` runs the existing Tauri app.
- `pnpm dev:www` runs the website.
- `pnpm check:desktop` checks the GPUI app and its examples.
- `pnpm test:desktop` runs `cargo test -p mdit-desktop --locked`.
- `pnpm test:legacy` runs `turbo run test --filter=@mdit/desktop-legacy`.
- `pnpm test:packages` runs `turbo run test --filter='./packages/*'`.
- `pnpm test:all` runs `turbo run test`.
- `pnpm check:rust:all` runs `cargo check --workspace --manifest-path Cargo.toml --locked`.
- `pnpm test:rust:all` runs `cargo test --workspace --manifest-path Cargo.toml --locked`.
- `pnpm test:rust:core` runs `cargo test --workspace --manifest-path Cargo.toml --exclude mdit --exclude mdit-desktop --locked`.
- `pnpm ts:check:legacy` runs `turbo run ts:check --filter=@mdit/desktop-legacy`.
- `pnpm ts:check:www` runs `turbo run ts:check --filter=@mdit/www`.
- `pnpm ts:check:all` runs `turbo run ts:check`.

- After changing TypeScript code, run `pnpm lint:fix`.
- After changing Rust code, run `cargo fmt --all --manifest-path Cargo.toml`.

## Layout
- `apps/desktop` is the GPUI app; `apps/desktop-legacy` is the existing Tauri app; `apps/www` is the website.
- `crates/*` contains shared Rust functionality; `packages/*` contains existing TypeScript packages.
- All Rust crates use the root Cargo workspace and lockfile. The default member is `mdit-desktop`.
- The desktop app currently targets macOS. Linux CI excludes `mdit-desktop`; macOS Desktop Checks covers it.
- Release tools live in `tooling/release`; release instructions are in `docs/releasing.md`.
