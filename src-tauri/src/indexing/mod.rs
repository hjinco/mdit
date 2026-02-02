//! Indexing pipeline for Markdown files inside a workspace directory.
//!
//! The overall flow is:
//! 1. `index_workspace` prepares the SQLite database, collects Markdown files,
//!    and orchestrates synchronization for every document.
//! 2. New or changed documents are chunked based on the requested chunking
//!    version, persisted as `segment` rows, and receive fresh embeddings.
//! 3. Deleted documents and surplus segments are removed to keep the database
//!    tidy while the `IndexSummary` keeps track of everything that happened.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::migrations;

mod chunking;
mod embedding;
mod files;
mod links;
mod search;
mod sync;

use embedding::{resolve_embedding_dimension, EmbeddingClient};
use files::collect_markdown_files;
pub(crate) use search::{search_notes_for_query, SemanticNoteEntry};
use sync::sync_documents;

const TARGET_CHUNKING_VERSION: i64 = 2;

/// Human readable summary of what happened during an indexing run.
#[derive(Debug, Default, Serialize)]
pub struct IndexSummary {
    /// Total Markdown files found in the workspace walk.
    pub files_discovered: usize,
    /// Files that were successfully processed (even if nothing changed).
    pub files_processed: usize,
    /// Newly inserted `doc` rows.
    pub docs_inserted: usize,
    /// `doc` rows that were deleted because the file disappeared or
    /// a forced re-index was requested.
    pub docs_deleted: usize,
    /// New `segment` rows created while chunking documents.
    pub segments_created: usize,
    /// Existing segments whose content hash changed.
    pub segments_updated: usize,
    /// Number of embeddings written or refreshed.
    pub embeddings_written: usize,
    /// Links written or refreshed.
    pub links_written: usize,
    /// Links deleted before refresh.
    pub links_deleted: usize,
    /// Detailed per-file errors that prevented indexing.
    pub skipped_files: Vec<String>,
}

/// Lightweight metadata returned for quick status checks.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingMeta {
    pub indexed_doc_count: usize,
}

pub(crate) struct EmbeddingContext {
    pub(crate) embedder: EmbeddingClient,
    pub(crate) target_dim: i32,
}

pub fn index_workspace(
    workspace_root: &Path,
    embedding_provider: &str,
    embedding_model: &str,
    force_reindex: bool,
) -> Result<IndexSummary> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    let has_embedding_config =
        !embedding_provider.trim().is_empty() && !embedding_model.trim().is_empty();

    let embedding_context = if has_embedding_config {
        // Resolve embedding dimension by generating a test embedding.
        let target_dim = resolve_embedding_dimension(embedding_provider, embedding_model)?;

        if target_dim <= 0 {
            return Err(anyhow!(
                "Target embedding dimension must be positive (received {})",
                target_dim
            ));
        }

        // Embedder handles communication with the chosen vector backend.
        let embedder = EmbeddingClient::new(embedding_provider, embedding_model)?;
        Some(EmbeddingContext {
            embedder,
            target_dim,
        })
    } else {
        None
    };

    let db_path = migrations::run_workspace_migrations(workspace_root)?;
    let mut conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", &1)
        .context("Failed to enable foreign keys for workspace database")?;

    // Force reindex wipes doc/segment tables so they can be recreated cleanly.
    let reset_deleted = if force_reindex {
        clear_index(&conn)?
    } else {
        0
    };

    let markdown_files = collect_markdown_files(workspace_root)?;

    let mut summary = IndexSummary {
        files_discovered: markdown_files.len(),
        docs_deleted: reset_deleted,
        ..Default::default()
    };

    sync_documents(
        &mut conn,
        workspace_root,
        markdown_files,
        embedding_context.as_ref(),
        &mut summary,
    )?;

    Ok(summary)
}

pub fn get_indexing_meta(workspace_root: &Path) -> Result<IndexingMeta> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    let db_path = migrations::run_workspace_migrations(workspace_root)?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    Ok(IndexingMeta {
        indexed_doc_count: count_indexed_docs(&conn)?,
    })
}

fn clear_index(conn: &Connection) -> Result<usize> {
    let deleted_docs = conn
        .execute("DELETE FROM doc", [])
        .context("Failed to clear documents for reindex")?;

    Ok(deleted_docs as usize)
}

fn count_indexed_docs(conn: &Connection) -> Result<usize> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM doc d \
             JOIN segment s ON s.doc_id = d.id AND s.ordinal = 0 \
             JOIN embedding e ON e.segment_id = s.id",
            [],
            |row| row.get(0),
        )
        .context("Failed to count indexed documents")?;

    Ok(count as usize)
}

/// Helper function to run a blocking operation in a separate thread and convert errors to String.
async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_workspace_command(
    workspace_path: String,
    embedding_provider: Option<String>,
    embedding_model: String,
    force_reindex: bool,
) -> Result<IndexSummary, String> {
    let workspace_path = PathBuf::from(workspace_path);
    let provider = match embedding_provider {
        Some(value) if !value.trim().is_empty() => value,
        _ => "ollama".to_string(),
    };
    let model = embedding_model;

    run_blocking(move || index_workspace(&workspace_path, &provider, &model, force_reindex)).await
}

#[tauri::command]
pub fn get_indexing_meta_command(workspace_path: String) -> Result<IndexingMeta, String> {
    let workspace_path = PathBuf::from(workspace_path);
    get_indexing_meta(&workspace_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_query_entries_command(
    workspace_path: String,
    query: String,
    embedding_provider: String,
    embedding_model: String,
) -> Result<Vec<SemanticNoteEntry>, String> {
    let workspace_path = PathBuf::from(workspace_path);

    run_blocking(move || {
        search_notes_for_query(
            &workspace_path,
            &query,
            &embedding_provider,
            &embedding_model,
        )
    })
    .await
}

/// Represents a single backlink (a document that links to the target document).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkEntry {
    /// Relative path from workspace root to the source document.
    pub rel_path: String,
    /// Filename without extension for display purposes.
    pub file_name: String,
}

/// Get all documents that link to the specified document (backlinks).
///
/// Queries the link table for entries where the target is the given document.
/// Returns a list of source documents with their relative paths and filenames.
pub fn get_backlinks(workspace_root: &Path, file_path: &Path) -> Result<Vec<BacklinkEntry>> {
    // Convert absolute file path to relative path
    let rel_path = file_path
        .strip_prefix(workspace_root)
        .with_context(|| {
            format!(
                "Failed to compute relative path for {} within workspace {}",
                file_path.display(),
                workspace_root.display()
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");

    // Database is located at <workspace_root>/.mdit/db.sqlite
    // Migrations are already applied when workspace is opened
    let db_path = workspace_root.join(".mdit").join("db.sqlite");
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    // Find the doc ID for the target file
    let target_doc_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM doc WHERE rel_path = ?1",
            params![&rel_path],
            |row| row.get(0),
        )
        .optional()
        .context("Failed to query target document ID")?;

    // Query for backlinks - documents that link to this one
    // We check both target_doc_id (for resolved links) and target_path (for unresolved)
    let mut backlinks = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT d.rel_path \
         FROM link l \
         JOIN doc d ON d.id = l.source_doc_id \
         WHERE l.target_doc_id = ?1 OR (l.target_doc_id IS NULL AND l.target_path = ?2) \
         ORDER BY d.rel_path",
        )
        .context("Failed to prepare backlink query")?;

    // Use -1 as sentinel for missing doc ID; query handles both resolved links (via target_doc_id)
    // and unresolved links (via target_path) using OR condition
    let target_doc_id_param = target_doc_id.unwrap_or(-1);
    let rows = stmt
        .query_map(params![target_doc_id_param, &rel_path], |row| {
            let rel_path: String = row.get(0)?;
            // Extract filename without extension
            let file_name = std::path::Path::new(&rel_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| rel_path.clone());

            Ok(BacklinkEntry {
                rel_path,
                file_name,
            })
        })
        .context("Failed to query backlinks")?;

    for row in rows {
        backlinks.push(row?);
    }

    Ok(backlinks)
}

#[tauri::command]
pub async fn get_backlinks_command(
    workspace_path: String,
    file_path: String,
) -> Result<Vec<BacklinkEntry>, String> {
    let workspace_path = PathBuf::from(workspace_path);
    let file_path = PathBuf::from(file_path);

    run_blocking(move || get_backlinks(&workspace_path, &file_path)).await
}
