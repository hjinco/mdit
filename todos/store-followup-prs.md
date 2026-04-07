# Store Follow-up TODOs

## Context

Current coupling status:

- `workspace -> indexing` direct writes removed
- `git-sync -> workspace` direct writes removed
- `workspace -> collection` direct writes removed
- `workspace -> tab` rename/history write orchestration removed
- `workspace -> tab` open/close lifecycle write orchestration still exists

Recently completed:

- added typed workspace tree events for collection reactions
- added `packages/store/src/integrations/register-collection-integration.ts`
- removed collection write-style calls from `workspace`
- added typed tab path events for rename/move/delete side effects
- added `packages/store/src/integrations/register-tab-path-integration.ts`
- removed tab rename/history write-style calls from `workspace`

Remaining goal:

- finish moving workspace-owned tab write orchestration into integrations or explicit caller workflows
- reduce `WorkspacePorts` to query/read APIs only

## PR 3: Move Tab Rename/History Sync Out of Workspace

Status: done

Goal:

- remove workspace-owned tab mutation commands for rename, move, and delete side effects

Definition of done:

- `workspace` no longer calls:
  - `removePathsFromHistory`
  - `renameTab`
  - `updateHistoryPath`
- tab rename/history synchronization happens in an integration file
- behavior is covered by integration tests

Implemented:

- added typed events to `packages/store/src/integrations/store-events.ts`
  - `workspace/tab-paths-removed`
  - `workspace/tab-path-renamed`
  - `workspace/tab-path-moved`
- emit those events from:
  - `packages/store/src/workspace/tree/entry-actions.ts`
  - `packages/store/src/workspace/fs/structure-actions.ts` edit-mode rename path
- added `packages/store/src/integrations/register-tab-path-integration.ts`
- moved tab reactions into that integration:
  - `removePathsFromHistory`
  - `renameTab`
  - `updateHistoryPath`
- kept read/query tab policy calls in workspace:
  - `getOpenTabSnapshots`
  - `getActiveTabPath`

Verified by tests:

- integration test: delete removes affected paths from tab history
- integration test: rename updates open tab path and history path
- integration test: move updates open tab path and history path
- integration test: event for different workspace is ignored
- workspace action tests assert event emission instead of direct tab write calls

## PR 4: Move Tab Open/Close Lifecycle Out of Workspace

Status: pending

Goal:

- remove remaining workspace-owned tab open/close orchestration

Definition of done:

- `workspace` no longer calls:
  - `openTab`
  - `closeAllTabs`
  - `clearHistory`
- lifecycle-driven tab behavior happens in an integration file or explicit caller workflow
- behavior is covered by integration tests

Current write call sites:

- `packages/store/src/workspace/lifecycle/domain.ts`
  - `closeWorkspaceTabs()` -> `ctx.ports.tab.closeAllTabs()`
  - `closeWorkspaceTabs()` -> `ctx.ports.tab.clearHistory()`
- `packages/store/src/workspace/fs/structure-actions.ts`
  - `createNote({ openTab: true })` -> `ctx.ports.tab.openTab(filePath)`
  - `createAndOpenNote()` still owns tab-open workflow

Candidate events:

- `workspace/switched`
- `workspace/cleared`
- `workspace/note-created`

Work items:

- define exact payloads for the lifecycle events before wiring
- add lifecycle events to `packages/store/src/integrations/store-events.ts`
- add a dedicated integration file for tab lifecycle reactions
- move close/open/history-clear behavior out of:
  - `packages/store/src/workspace/lifecycle/domain.ts`
  - `packages/store/src/workspace/fs/structure-actions.ts`
- preserve current UI behavior while changing ownership
- keep long-term direction explicit:
  - `createNote()` should create and return a path
  - opening the tab should happen in integration or caller-level workflow

Tests:

- integration test: workspace switch/reset closes tabs as before
- integration test: history clearing behavior remains unchanged
- integration test: note creation still opens the new note when requested

Watch item:

- newly created note selection currently happens next to `openTab()`
- if tab open moves out, confirm whether selection stays in workspace or moves with the caller workflow

## PR 5: Re-evaluate WorkspacePorts

Status: pending

Goal:

- keep only read/query ports that are still justified

Definition of done:

- `packages/store/src/workspace/workspace-ports.ts` contains only read/query-style APIs
- write orchestration lives in integrations or explicit caller workflows

Likely keep for now:

- `tab.getOpenTabSnapshots`
- `tab.getActiveTabPath`
- `collection.getCurrentCollectionPath`

Likely remove after PR 3 and PR 4:

- `tab.openTab`
- `tab.closeTab`
- `tab.closeAllTabs`
- `tab.renameTab`
- `tab.clearActiveTabSyncedName`
- `tab.refreshTabFromExternalContent`
- `tab.updateHistoryPath`
- `tab.removePathsFromHistory`
- `tab.clearHistory`
- any remaining collection write-style port

Work items:

- audit every remaining `ctx.ports.tab.*` call site
- audit every remaining `ctx.ports.collection.*` call site
- classify each remaining port as:
  - query/read
  - integration-owned write
  - caller-workflow-owned write
- remove dead write ports from `packages/store/src/workspace/workspace-ports.ts`
- remove dead test helper mocks from `packages/store/src/workspace/shared/action-test-helpers.ts`
- update tests to stop depending on removed write ports

## Guardrails

- do not introduce a generic event bus with stringly-typed payloads beyond the local typed hub
- keep event names narrow and domain-specific
- prefer one small PR per coupling boundary
- every moved coupling should gain an integration test
- avoid changing UI behavior while moving orchestration
