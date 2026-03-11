use std::path::Path;

use anyhow::Result;

use crate::{
    store::SyncWorkspaceStore,
    types::{ApplyRemoteWorkspaceInput, ApplyRemoteWorkspaceResult},
};

use super::{
    conflicts::plan_apply_decisions, materializer::materialize_workspace,
    state::prepare_applied_state, validator::validate_apply_input,
};

pub fn apply_remote_workspace(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    input: ApplyRemoteWorkspaceInput,
) -> Result<ApplyRemoteWorkspaceResult> {
    let existing_entries = store.list_sync_entries()?;
    let previous_vault_state = store.get_sync_vault_state()?;
    let plan = validate_apply_input(input)?;

    let decisions = plan_apply_decisions(workspace_root, &existing_entries, &plan)?;
    materialize_workspace(workspace_root, &plan, &decisions)?;

    let prepared = prepare_applied_state(
        workspace_root,
        &plan,
        existing_entries,
        previous_vault_state,
        &decisions,
    )?;
    let persisted = store.persist_sync_state(&prepared.persist_input)?;
    let sync_vault_state = persisted.sync_vault_state.ok_or_else(|| {
        anyhow::anyhow!("Expected sync vault state after apply persistence")
    })?;

    Ok(ApplyRemoteWorkspaceResult {
        sync_vault_state,
        entries: persisted.entries,
        exclusion_events: persisted.exclusion_events,
        manifest: plan.manifest,
        files_applied: plan.provided_files_count,
        entries_deleted: prepared.entries_deleted,
    })
}
