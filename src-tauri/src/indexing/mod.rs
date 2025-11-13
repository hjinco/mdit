//! Indexing pipeline for Markdown files inside a workspace directory.
//!
//! The overall flow is:
//! 1. `index_workspace` prepares the SQLite database, collects Markdown files,
//!    and orchestrates synchronization for every document.
//! 2. New or changed documents are chunked based on the requested chunking
//!    version, persisted as `segment` rows, and receive fresh embeddings.
//! 3. Deleted documents and surplus segments are removed to keep the database
//!    tidy while the `IndexSummary` keeps track of everything that happened.

use std::path::Path;

use anyhow::{anyhow, Context, Result};
use rusqlite::Connection;
use serde::Serialize;

use crate::migrations;

mod chunking;
mod embedding;
mod files;
mod sync;

use embedding::{resolve_embedding_dimension, EmbeddingClient};
use files::collect_markdown_files;
use sync::sync_documents;

const TARGET_CHUNKING_VERSION: i64 = 1;

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
    /// Detailed per-file errors that prevented indexing.
    pub skipped_files: Vec<String>,
}

/// Lightweight metadata returned for quick status checks.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingMeta {
    pub indexed_doc_count: usize,
}

pub fn index_workspace(
    workspace_root: &Path,
    embedding_provider: &str,
    embedding_model: &str,
    force_reindex: bool,
) -> Result<IndexSummary> {
    // Validate user-provided configuration up front for clearer errors.
    if embedding_provider.trim().is_empty() {
        return Err(anyhow!("Embedding provider must be provided"));
    }

    if embedding_model.trim().is_empty() {
        return Err(anyhow!("Embedding model must be provided"));
    }

    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

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

    let db_path = migrations::apply_workspace_migrations(workspace_root)?;
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
        markdown_files,
        &embedder,
        target_dim,
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

    let db_path = migrations::apply_workspace_migrations(workspace_root)?;
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
