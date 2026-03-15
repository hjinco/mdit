# `sync-client`

`sync-client` is the remote sync orchestration layer for Mdit workspaces.

It coordinates push and pull flows, progress reporting, remote head checks, blob transfer contracts, and post-sync state transitions. It delegates local filesystem scanning, encryption, decryption, merge-aware apply behavior, and sync-state persistence mechanics to `sync-engine`.

The crate does not implement HTTP transport or a concrete remote API client. Callers provide that integration through `SyncRemoteClient`.

## What It Does

The crate exposes a small set of sync entrypoints and contracts:

- `push_workspace` prepares local sync payloads, uploads blobs through a caller-provided remote client, creates a remote commit, and finalizes local sync state.
- `pull_workspace` reads the remote head, downloads and validates the remote payload, decrypts it through `sync-engine`, and applies the result to the local workspace.
- `SyncRemoteClient` defines the remote operations that a transport adapter must implement.
- `SyncProgressSink` receives lifecycle and progress events during push and pull operations. `NoopProgressSink` is the default sink when the caller does not need progress reporting.
- `SyncClientError` is the shared error type for local failures, remote failures, and remote head conflicts.

## Push Workflow

`push_workspace` currently performs the following sequence:

1. Build a `RemoteContext` from the input server URL, auth token, and user id.
2. Emit `Starting` and `Scanning` progress events.
3. Call `sync-engine::prepare_push_workspace` to scan the local workspace and produce encrypted file blobs plus an encrypted manifest blob.
4. Return `PushWorkspaceOutcome::NoChanges` only when the local delta has no changes and the workspace already has a last synced commit id.
5. Call `SyncRemoteClient::create_vault` to ensure the remote vault exists.
6. Fetch the remote head with `SyncRemoteClient::get_head` and reject a mismatched head with `SyncClientError::HeadConflict`.
7. Upload each file blob, then the manifest blob, through `SyncRemoteClient::upload_blob` while emitting `Uploading` progress events.
8. Create the remote commit through `SyncRemoteClient::create_commit`.
9. Call `sync-engine::finalize_push_workspace` to persist the new synced state after the commit succeeds.
10. Emit a final `Finished` progress event and return the updated manifest, sync state, entries, exclusion events, commit metadata, and upload count.

## Pull Workflow

`pull_workspace` currently performs the following sequence:

1. Build a `RemoteContext` and emit `Starting` plus initial `Downloading` progress events.
2. Load or initialize local sync vault state through the provided `SyncWorkspaceStore`.
3. Read the remote head with `SyncRemoteClient::get_head`.
4. Return `PullWorkspaceOutcome::EmptyRemote` when the remote head does not contain a commit id.
5. Return `PullWorkspaceOutcome::AlreadyUpToDate` when the remote head commit id matches the locally persisted last synced commit id.
6. Fetch the head commit with `SyncRemoteClient::get_commit`, then fetch the manifest blob with `SyncRemoteClient::get_blob`.
7. Validate the manifest blob envelope and ciphertext hash before decryption.
8. Decrypt the manifest with `sync-engine::decrypt_manifest_blob`.
9. For each file entry in the manifest, fetch the blob, validate the blob envelope, decrypt the file with `sync-engine::decrypt_file_blob`, and verify the decrypted content hash against the manifest.
10. Fetch base payloads only for changed Markdown entries when a previous synced commit exists and a merge-aware apply may need base content.
11. Call `sync-engine::apply_remote_workspace` to materialize the remote workspace locally and persist the new sync state.
12. Emit `Applying` and `Finished` progress events and return the applied manifest, counters, mutated paths, and persisted state.

## Public Types and Interfaces

- `push_workspace` accepts `PushWorkspaceInput` and returns `PushWorkspaceResult`, which includes the push outcome, persisted sync state, manifest, optional commit result, uploaded blob count, and store-backed entry snapshots.
- `pull_workspace` accepts `PullWorkspaceInput` and returns `PullWorkspaceResult`, which includes the pull outcome, optional applied manifest, optional synced head id, file and deletion counters, mutated paths, and persisted state snapshots.
- `SyncProgressEvent` reports a `session_id`, workspace path, `SyncDirection`, `SyncPhase`, and optional progress counters.
- `RemoteContext` carries the remote server URL, auth token, and user id used by the transport adapter.
- `SyncRemoteHead`, `CreateRemoteVaultResult`, `UploadRemoteBlobInput`, `UploadRemoteBlobResult`, `RemoteBlobEnvelope`, `CreateRemoteCommitInput`, `CreateRemoteCommitResult`, and `RemoteCommitRecord` define the remote-facing request and response shapes used by the orchestration layer.
- `SyncRemoteClient` is the public remote adapter contract. Implementors provide `create_vault`, `get_head`, `upload_blob`, `get_blob`, `create_commit`, and `get_commit`.
- `SyncProgressSink` is the public progress adapter contract. `NoopProgressSink` is a no-op implementation for callers that do not consume progress events.

## Behavior Notes

The current implementation and tests confirm the following behavior:

- A no-op push returns `PushWorkspaceOutcome::NoChanges` only when there are no local changes and the workspace already has a last synced commit id.
- An empty workspace push still uploads a manifest blob, creates a commit, and persists the resulting synced head.
- Push rejects a preflight head mismatch before upload and also propagates head conflicts returned by remote commit creation.
- Pull validates remote blob ids, ciphertext hashes, ciphertext sizes, and decrypted file content hashes before applying remote content locally.
- Pull fetches base payloads only for changed Markdown entries, not for non-Markdown files.

## Where This Crate Fits

`sync-client` sits between the local sync engine and an app-specific transport implementation.

`sync-engine` owns local scanning, encryption, decryption, merge-aware apply behavior, and persistence orchestration through `SyncWorkspaceStore`. `sync-client` owns the higher-level remote flow: building remote context, driving push and pull sequencing, validating remote payloads, coordinating progress events, handling head checks, and translating remote operations through `SyncRemoteClient`.

In this repository, that means `sync-client` is the shared orchestration layer that an app-side HTTP or RPC client can call into without reimplementing the sync workflow itself.
