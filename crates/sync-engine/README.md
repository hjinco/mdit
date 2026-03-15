# `sync-engine`

`sync-engine` is the local sync core for Mdit workspaces.

It owns local filesystem scanning, manifest and blob preparation, remote payload application, and sync-state persistence orchestration through a storage abstraction. It does not own network transport or remote API calls. That orchestration lives in `sync-client`.

## What It Does

The crate exposes a small set of sync primitives:

- `scan_workspace` scans a workspace root, reconciles what is on disk with previously persisted sync metadata, updates the local store, and returns a manifest plus a delta summary.
- `prepare_push_workspace` scans the workspace and produces encrypted file blobs plus an encrypted manifest blob that can be uploaded by another layer.
- `finalize_push_workspace` persists the post-push state after the caller has successfully created a remote commit.
- `decrypt_manifest_blob` and `decrypt_file_blob` decrypt blobs that were downloaded elsewhere.
- `apply_remote_workspace` validates a remote manifest plus decrypted file payloads, materializes the target workspace on disk, records conflicts, and persists the resulting sync state.

## Sync Workflow

### Push Flow

1. Call `scan_workspace` or `prepare_push_workspace` on the local workspace root.
2. Use `prepare_push_workspace` when you need encrypted file blobs and a manifest blob for upload.
3. Upload those blobs and create the remote commit outside this crate.
4. After the remote commit succeeds, call `finalize_push_workspace` to mark entries as synced and persist the new remote commit metadata.

### Pull Flow

1. Download the remote manifest blob and file blobs outside this crate.
2. Decrypt them with `decrypt_manifest_blob` and `decrypt_file_blob`.
3. Build `ApplyRemoteWorkspaceInput` from the decrypted manifest and file payloads.
4. Call `apply_remote_workspace` to update the workspace on disk and persist the new local sync state.

## Storage Contract

`sync-engine` is storage-agnostic. Callers provide a `SyncWorkspaceStore` implementation that handles:

- sync vault state reads and writes
- sync entry listing, upserts, and deletes
- conflict recording
- exclusion event recording and replacement
- atomic persistence through `persist_sync_state`

The app-side reference implementation lives in [`crates/sync-runtime/src/store.rs`](../sync-runtime/src/store.rs).

## Core Data Model

- `SyncVaultState` stores per-workspace sync metadata such as the local vault id, remote vault id, last synced commit id, current key version, and timestamps.
- `SyncEntryRecord` is the persisted store view of a tracked entry. `LocalSyncEntryState` is the in-memory snapshot form used while scanning and preparing payloads.
- `LocalSyncManifest` is the serialized workspace snapshot exchanged with the remote side. `LocalSyncManifestEntry` distinguishes directories from files and carries file blob identifiers, content hashes, sizes, and modification times.
- `PreparedSyncWorkspaceResult` contains the scanned local state together with encrypted file blobs, the encrypted manifest blob, delta information, and deleted entry ids for the pending push.
- `ApplyRemoteWorkspaceInput` carries a decrypted manifest, decrypted file payloads, and remote commit metadata. `ApplyRemoteWorkspaceResult` returns the persisted state plus the set of mutated relative paths and apply counters.

## Behavior Notes

The current implementation and tests confirm the following behavior:

- Hidden files and directories are ignored during scans.
- Symlinks are not followed. Symlink paths are recorded as exclusion events.
- Files that cannot be read and files larger than `ScanOptions.max_file_size_bytes` are excluded and recorded as exclusion events.
- Scan reconciliation tries to preserve entry ids across exact path matches, renames, and moves when the match is unambiguous.
- Scan deltas report created, updated, moved, deleted, and conflicted counts, plus a `has_changes` summary flag.
- `apply_remote_workspace` can keep local content, replace local content with remote content, or record conflicts depending on local state and remote/base hashes.
- Markdown files may be merged during apply when `base_plaintext_base64` is provided in `ApplyRemoteSyncFileInput`.
- Apply operations refuse to write over symlink files or symlink directories.

## Where This Crate Fits

`sync-engine` is the local execution layer. It expects another crate or service to handle remote API calls, blob upload and download, head checks, and commit creation. In this repository, that higher-level orchestration lives in `sync-client`, which calls into `sync-engine` for local scanning, encryption, decryption, and apply operations.
