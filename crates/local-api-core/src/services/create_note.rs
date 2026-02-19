use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::LocalApiError;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub vault_id: i64,
    pub directory_rel_path: Option<String>,
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedNote {
    pub vault_id: i64,
    pub workspace_path: String,
    pub relative_path: String,
    pub absolute_path: String,
}

#[derive(Debug)]
struct ResolvedNotePath {
    note_path: PathBuf,
    relative_path: String,
}

pub fn create_note(db_path: &Path, input: CreateNoteInput) -> Result<CreatedNote, LocalApiError> {
    let CreateNoteInput {
        vault_id,
        directory_rel_path,
        title,
        content,
    } = input;
    let workspace = resolve_workspace(db_path, vault_id)?;
    let workspace_path = PathBuf::from(&workspace.workspace_root);
    let resolved_note_path = resolve_note_path(&workspace_path, directory_rel_path, &title)?;
    write_note_file(
        &resolved_note_path.note_path,
        &resolved_note_path.relative_path,
        content,
    )?;
    touch_workspace_best_effort(db_path, &workspace_path);

    Ok(CreatedNote {
        vault_id: workspace.id,
        workspace_path: normalize_path_separators(&workspace_path),
        relative_path: resolved_note_path.relative_path,
        absolute_path: normalize_path_separators(&resolved_note_path.note_path),
    })
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

fn resolve_note_path(
    workspace_path: &Path,
    directory_rel_path: Option<String>,
    title: &str,
) -> Result<ResolvedNotePath, LocalApiError> {
    let note_file_name = resolve_note_file_name(title)?;
    let directory_rel_path = normalize_directory_rel_path(directory_rel_path);
    validate_relative_directory(&directory_rel_path)?;

    let target_directory = resolve_target_directory(workspace_path, &directory_rel_path)?;
    let note_path = target_directory.join(&note_file_name);
    let relative_path = normalize_path_separators(
        note_path
            .strip_prefix(workspace_path)
            .unwrap_or(note_path.as_path()),
    );

    if note_path.exists() {
        return Err(LocalApiError::NoteAlreadyExists { relative_path });
    }

    Ok(ResolvedNotePath {
        note_path,
        relative_path,
    })
}

fn resolve_note_file_name(title: &str) -> Result<String, LocalApiError> {
    let sanitized_title = sanitize_note_title(title);
    if sanitized_title.is_empty() {
        return Err(LocalApiError::InvalidTitle);
    }

    Ok(ensure_md_extension(sanitized_title))
}

fn write_note_file(
    note_path: &Path,
    relative_path: &str,
    content: Option<String>,
) -> Result<(), LocalApiError> {
    let mut file = match OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(note_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(LocalApiError::NoteAlreadyExists {
                relative_path: relative_path.to_string(),
            });
        }
        Err(error) => return Err(error.into()),
    };

    if let Some(content) = content {
        file.write_all(content.as_bytes())?;
    }

    Ok(())
}

fn touch_workspace_best_effort(db_path: &Path, workspace_path: &Path) {
    if let Err(error) = app_storage::vault::touch_workspace(db_path, workspace_path) {
        eprintln!(
            "Failed to update vault last_opened_at after note creation for '{}': {error}",
            workspace_path.display()
        );
    }
}

fn sanitize_note_title(title: &str) -> String {
    title
        .chars()
        .filter(|c| *c != '/' && *c != '\\')
        .collect::<String>()
        .trim()
        .to_string()
}

fn ensure_md_extension(title: String) -> String {
    if title.to_ascii_lowercase().ends_with(".md") {
        title
    } else {
        format!("{title}.md")
    }
}

fn normalize_directory_rel_path(directory_rel_path: Option<String>) -> String {
    let value = directory_rel_path
        .unwrap_or_else(|| ".".to_string())
        .trim()
        .replace('\\', "/");

    if value.is_empty() {
        ".".to_string()
    } else {
        value
    }
}

fn validate_relative_directory(directory_rel_path: &str) -> Result<(), LocalApiError> {
    let path = Path::new(directory_rel_path);

    if path.is_absolute() {
        return Err(LocalApiError::InvalidDirectoryPath {
            directory_rel_path: directory_rel_path.to_string(),
        });
    }

    for component in path.components() {
        match component {
            Component::CurDir | Component::Normal(_) => {}
            _ => {
                return Err(LocalApiError::InvalidDirectoryPath {
                    directory_rel_path: directory_rel_path.to_string(),
                });
            }
        }
    }

    Ok(())
}

fn resolve_target_directory(
    workspace_path: &Path,
    directory_rel_path: &str,
) -> Result<PathBuf, LocalApiError> {
    let target_directory = if directory_rel_path == "." {
        workspace_path.to_path_buf()
    } else {
        workspace_path.join(directory_rel_path)
    };

    if !target_directory.is_dir() {
        return Err(LocalApiError::DirectoryNotFound {
            directory_rel_path: directory_rel_path.to_string(),
        });
    }

    let canonical_workspace = fs::canonicalize(workspace_path)?;
    let canonical_target = fs::canonicalize(&target_directory)?;

    if !canonical_target.starts_with(&canonical_workspace) {
        return Err(LocalApiError::InvalidDirectoryPath {
            directory_rel_path: directory_rel_path.to_string(),
        });
    }

    Ok(canonical_target)
}

fn normalize_path_separators(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::{create_note, CreateNoteInput};
    use crate::{services::test_support::Harness, LocalApiError};

    #[test]
    fn create_note_returns_error_when_note_already_exists() {
        let harness = Harness::new("local-api-note-conflict");
        let existing = harness.workspace_path.join("Daily.md");
        fs::write(&existing, "# existing").expect("failed to write existing note");

        let result = create_note(
            Path::new(&harness.db_path),
            CreateNoteInput {
                vault_id: harness.vault_id,
                directory_rel_path: None,
                title: "Daily".to_string(),
                content: Some("# new".to_string()),
            },
        );

        match result {
            Err(LocalApiError::NoteAlreadyExists { relative_path }) => {
                assert_eq!(relative_path, "Daily.md")
            }
            other => panic!("expected conflict error, got {other:?}"),
        }
    }

    #[test]
    fn create_note_returns_error_when_sanitized_title_is_empty() {
        let harness = Harness::new("local-api-empty-title");

        let result = create_note(
            Path::new(&harness.db_path),
            CreateNoteInput {
                vault_id: harness.vault_id,
                directory_rel_path: None,
                title: " / \\ ".to_string(),
                content: None,
            },
        );

        assert!(matches!(result, Err(LocalApiError::InvalidTitle)));
    }

    #[test]
    fn create_note_returns_error_when_directory_path_traverses_parent() {
        let harness = Harness::new("local-api-traversal");

        let result = create_note(
            Path::new(&harness.db_path),
            CreateNoteInput {
                vault_id: harness.vault_id,
                directory_rel_path: Some("../outside".to_string()),
                title: "Test".to_string(),
                content: None,
            },
        );

        match result {
            Err(LocalApiError::InvalidDirectoryPath { directory_rel_path }) => {
                assert_eq!(directory_rel_path, "../outside")
            }
            other => panic!("expected invalid directory path error, got {other:?}"),
        }
    }
}
