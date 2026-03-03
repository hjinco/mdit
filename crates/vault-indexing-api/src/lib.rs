use std::path::Path;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikiLinkRequest {
    pub workspace_path: String,
    pub current_note_path: Option<String>,
    pub raw_target: String,
    pub workspace_rel_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikiLinkResult {
    pub canonical_target: String,
    pub resolved_rel_path: Option<String>,
    pub match_count: usize,
    pub disambiguated: bool,
    pub unresolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkEntry {
    pub rel_path: String,
    pub file_name: String,
}

pub trait VaultIndexingRuntime: Send + Sync {
    fn run_workspace_index(&self, workspace_root: &Path, db_path: &Path) -> Result<()>;
    fn index_note(&self, workspace_root: &Path, db_path: &Path, note_path: &Path) -> Result<()>;
    fn delete_indexed_note(
        &self,
        workspace_root: &Path,
        db_path: &Path,
        note_path: &Path,
    ) -> Result<()>;
    fn delete_indexed_notes_by_prefix(
        &self,
        workspace_root: &Path,
        db_path: &Path,
        path_prefix: &Path,
    ) -> Result<()>;
    fn rename_indexed_note(
        &self,
        workspace_root: &Path,
        db_path: &Path,
        old_note_path: &Path,
        new_note_path: &Path,
    ) -> Result<()>;
    fn get_backlinks(
        &self,
        workspace_root: &Path,
        db_path: &Path,
        file_path: &Path,
    ) -> Result<Vec<BacklinkEntry>>;
    fn resolve_wiki_link(&self, request: ResolveWikiLinkRequest) -> Result<ResolveWikiLinkResult>;
}
