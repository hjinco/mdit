use std::path::Path;

use serde::Serialize;

use crate::LocalApiError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSummary {
    pub id: i64,
    pub workspace_path: String,
    pub last_opened_at: String,
}

pub fn list_vaults(db_path: &Path) -> Result<Vec<VaultSummary>, LocalApiError> {
    let rows = app_storage::vault::list_workspaces_with_meta(db_path)?;

    let vaults = rows
        .into_iter()
        .filter(|row| Path::new(&row.workspace_root).is_dir())
        .map(|row| VaultSummary {
            id: row.id,
            workspace_path: row.workspace_root,
            last_opened_at: row.last_opened_at,
        })
        .collect();

    Ok(vaults)
}
