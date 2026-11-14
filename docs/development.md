# Development layout

Run development commands from the repository root.

| Directory | Purpose |
| --- | --- |
| `apps/desktop` | New GPUI app (`mdit-desktop`) |
| `apps/desktop-legacy` | Existing Tauri app (`@mdit/desktop-legacy`; Rust package `mdit`) |
| `apps/www` | Website (`@mdit/www`) |
| `crates` | Shared Rust functionality |
| `packages` | Existing shared TypeScript packages |
| `tooling/release` | macOS packaging, signing, notarization and update feeds |
| `docs` | Development and release documentation |

All Rust packages belong to the root Cargo workspace and use its `Cargo.lock`.
The default member is `mdit-desktop`, so `cargo run --locked` starts the new app.
Build output is written to the root `target/` directory.

```sh
pnpm dev:desktop        # GPUI
pnpm dev:legacy         # Tauri
pnpm dev:www            # Website
pnpm check:desktop
pnpm ts:check:legacy
pnpm ts:check:www
pnpm test:legacy
pnpm test:rust:core     # Shared Rust crates, excluding both apps
```

`test:desktop` runs the GPUI Rust tests; `test:all` retains the TypeScript/Turbo
test suite. `test:rust:all` runs all Rust packages. The GPUI app currently targets
macOS, so Linux CI checks the legacy app and shared Rust crates while the macOS
Desktop Checks workflow checks GPUI. Both apps use the same `core-foundation`
0.10 API; GPUI 0.2.2 currently constrains the workspace to 0.10.0.

Keep platform startup, menus, lifecycle and updating in the application.
Extract shared logic into `crates` when it is needed. Existing TS packages and
the legacy app remain available during the transition. Add `apps/mobile` and
shared UI crates when mobile development begins; no empty scaffolding is needed.

The legacy app keeps its existing bundle identity for transition testing.
Release bundles continue to use `Mdit.app`, `app.mdit` and `Contents/MacOS/mdit`.
See [Releasing](releasing.md) for the GPUI release workflow.
