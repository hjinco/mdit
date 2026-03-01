use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::LocalApiError;

const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: usize = 100;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesInput {
    pub vault_id: i64,
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesOutput {
    pub results: Vec<SearchNoteEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNoteEntry {
    pub path: String,
    pub name: String,
    pub created_at: Option<i64>,
    pub modified_at: Option<i64>,
    pub similarity: f32,
}

pub fn search_notes(
    db_path: &Path,
    input: SearchNotesInput,
) -> Result<SearchNotesOutput, LocalApiError> {
    let SearchNotesInput {
        vault_id,
        query,
        limit,
    } = input;
    let workspace = resolve_workspace(db_path, vault_id)?;
    let workspace_path = PathBuf::from(&workspace.workspace_root);
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Err(LocalApiError::InvalidSearchQuery);
    }

    let limit = resolve_limit(limit)?;
    let results =
        indexing::search_notes_for_query(&workspace_path, db_path, trimmed_query, "", "")?
            .into_iter()
            .take(limit)
            .map(|entry| SearchNoteEntry {
                path: entry.path,
                name: entry.name,
                created_at: entry.created_at,
                modified_at: entry.modified_at,
                similarity: entry.similarity,
            })
            .collect();

    Ok(SearchNotesOutput { results })
}

fn resolve_workspace(
    db_path: &Path,
    vault_id: i64,
) -> Result<app_storage::vault::VaultWorkspace, LocalApiError> {
    let workspace = app_storage::vault::get_workspace_by_id(db_path, vault_id)?
        .ok_or(LocalApiError::VaultNotFound { vault_id })?;
    let workspace_path = PathBuf::from(&workspace.workspace_root);

    if !workspace_path.is_dir() {
        return Err(LocalApiError::VaultWorkspaceUnavailable {
            workspace_path: workspace.workspace_root,
        });
    }

    Ok(workspace)
}

fn resolve_limit(limit: Option<usize>) -> Result<usize, LocalApiError> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(LocalApiError::InvalidSearchLimit { limit });
    }

    Ok(limit)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::{search_notes, SearchNotesInput};
    use crate::{services::test_support::Harness, LocalApiError};

    #[test]
    fn search_notes_returns_error_when_query_is_empty() {
        let harness = Harness::new("local-api-search-empty-query");

        let result = search_notes(
            Path::new(&harness.db_path),
            SearchNotesInput {
                vault_id: harness.vault_id,
                query: "   ".to_string(),
                limit: None,
            },
        );

        assert!(matches!(result, Err(LocalApiError::InvalidSearchQuery)));
    }

    #[test]
    fn search_notes_returns_error_when_limit_is_out_of_range() {
        let harness = Harness::new("local-api-search-limit-range");

        for limit in [0, 101] {
            let result = search_notes(
                Path::new(&harness.db_path),
                SearchNotesInput {
                    vault_id: harness.vault_id,
                    query: "query".to_string(),
                    limit: Some(limit),
                },
            );

            match result {
                Err(LocalApiError::InvalidSearchLimit {
                    limit: invalid_limit,
                }) => {
                    assert_eq!(invalid_limit, limit)
                }
                other => panic!("expected invalid limit error, got {other:?}"),
            }
        }
    }

    #[test]
    fn search_notes_returns_error_when_vault_is_missing() {
        let harness = Harness::new("local-api-search-missing-vault");

        let result = search_notes(
            Path::new(&harness.db_path),
            SearchNotesInput {
                vault_id: harness.vault_id + 100,
                query: "query".to_string(),
                limit: None,
            },
        );

        match result {
            Err(LocalApiError::VaultNotFound { vault_id }) => {
                assert_eq!(vault_id, harness.vault_id + 100)
            }
            other => panic!("expected missing vault error, got {other:?}"),
        }
    }

    #[test]
    fn search_notes_returns_ranked_results_and_applies_limit() {
        let harness = Harness::new("local-api-search-success");
        let alpha_path = harness.workspace_path.join("Alpha.md");
        let beta_path = harness.workspace_path.join("Beta.md");

        fs::write(&alpha_path, build_content("nebula")).expect("failed to write Alpha.md");
        fs::write(&beta_path, build_content("nebula")).expect("failed to write Beta.md");

        indexing::index_workspace(
            Path::new(&harness.workspace_path),
            Path::new(&harness.db_path),
            "",
            "",
            false,
        )
        .expect("failed to index workspace");

        let full = search_notes(
            Path::new(&harness.db_path),
            SearchNotesInput {
                vault_id: harness.vault_id,
                query: "nebula".to_string(),
                limit: None,
            },
        )
        .expect("search should succeed");
        assert!(full.results.len() >= 2);

        let limited = search_notes(
            Path::new(&harness.db_path),
            SearchNotesInput {
                vault_id: harness.vault_id,
                query: "nebula".to_string(),
                limit: Some(1),
            },
        )
        .expect("limited search should succeed");

        assert_eq!(limited.results.len(), 1);
        assert!(full
            .results
            .iter()
            .any(|result| result.path == limited.results[0].path));
        assert!(limited.results[0].path.ends_with(".md"));
        assert!(!limited.results[0].name.is_empty());
    }

    fn build_content(query: &str) -> String {
        format!("# Title\n\n{query}\n\n{}\n", "lorem ipsum ".repeat(40))
    }
}
