# Mdit

Mdit is a lightweight Markdown note taking app for desktop.  
It focuses on:

- Local first storage using plain `.md` files
- Privacy (no tracking, your data stays on your machine)
- Fast, minimal UI that feels good for writing
- Optional AI features powered by your own API keys or local models

> Note: Mdit is still under active development. APIs and behavior may change.

---

## Features

- Write and edit notes in plain Markdown
- Organize notes in workspaces backed by folders on your file system
- Notion like slash commands for quick actions
- Local database for search and metadata
- Optional AI helpers for rewriting, summarizing, and more (when configured)

You can use it as a simple Markdown editor, or as a more powerful note system with search and AI.

---

## Requirements

Before you build Mdit, make sure you have:

- **Node.js** (recommended: latest LTS)
- **pnpm** package manager  
  Install with: `npm install -g pnpm`
- **Rust toolchain** (for Tauri)
- **Tauri prerequisites** for your platform  
  See the official Tauri docs for platform specific setup.

---

## Build

To create a production build of the app:

pnpm tauri build

## License

This project is licensed under the Apache License, Version 2.0.
You can find the full license text in the LICENSE file.