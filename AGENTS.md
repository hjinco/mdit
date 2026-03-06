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
