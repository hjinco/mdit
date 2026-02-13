//! Indexing pipeline for Markdown files inside a workspace directory.
//!
//! The overall flow is:
//! 1. `index_workspace` prepares the SQLite database, collects Markdown files,
//!    and orchestrates synchronization for every document.
//! 2. New or changed documents are chunked based on the requested chunking
//!    version, persisted as `segment` rows, and receive fresh embeddings.
//! 3. Deleted documents and surplus segments are removed to keep the database
//!    tidy while the `IndexSummary` keeps track of everything that happened.

use std::{
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::migrations;

mod chunking;
mod embedding;
mod files;
mod links;
mod search;
mod sync;

use embedding::{resolve_embedding_dimension, EmbeddingClient};
use files::collect_markdown_files;
use links::resolve_wiki_link_target;
pub(crate) use search::{search_notes_for_query, SemanticNoteEntry};
use sync::{clear_segment_vectors_for_vault, sync_documents_with_prune};

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikiLinkRequest {
    pub workspace_path: String,
    pub current_note_path: Option<String>,
    pub raw_target: String,
    pub workspace_rel_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikiLinkResult {
    pub canonical_target: String,
    pub resolved_rel_path: Option<String>,
    pub match_count: usize,
    pub disambiguated: bool,
    pub unresolved: bool,
}

pub(crate) struct EmbeddingContext {
    pub(crate) embedder: EmbeddingClient,
    pub(crate) target_dim: i32,
}

fn open_indexing_connection(db_path: &Path) -> Result<Connection> {
    crate::sqlite_vec_ext::register_auto_extension()?;

    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open indexing database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", 1)
        .context("Failed to enable foreign keys for indexing database")?;

    Ok(conn)
}

fn create_embedding_context(
    embedding_provider: &str,
    embedding_model: &str,
) -> Result<Option<EmbeddingContext>> {
    let has_embedding_config =
        !embedding_provider.trim().is_empty() && !embedding_model.trim().is_empty();

    if !has_embedding_config {
        return Ok(None);
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
    Ok(Some(EmbeddingContext {
        embedder,
        target_dim,
    }))
}

fn canonicalize_workspace_root(workspace_root: &Path) -> Result<PathBuf> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    fs::canonicalize(workspace_root).with_context(|| {
        format!(
            "Failed to canonicalize workspace path {}",
            workspace_root.display()
        )
    })
}

fn normalize_workspace_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_markdown_or_mdx(path: &Path) -> bool {
    matches!(
        path.extension().and_then(OsStr::to_str),
        Some(ext) if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("mdx")
    )
}

fn collect_workspace_rel_paths_for_wiki_resolution(workspace_root: &Path) -> Result<Vec<String>> {
    let mut rel_paths = Vec::new();

    for entry in WalkDir::new(workspace_root).follow_links(false) {
        let entry = entry.with_context(|| "Failed to traverse workspace for wiki resolution")?;
        if entry.file_type().is_dir() || !is_markdown_or_mdx(entry.path()) {
            continue;
        }

        let rel = entry.path().strip_prefix(workspace_root).with_context(|| {
            format!(
                "Failed to compute relative path for {}",
                entry.path().display()
            )
        })?;
        rel_paths.push(files::normalize_rel_path(rel));
    }

    rel_paths.sort();
    Ok(rel_paths)
}

fn sanitize_workspace_rel_path(path: &str) -> Option<String> {
    let normalized = path.replace('\\', "/").trim().to_string();
    if normalized.is_empty() {
        return None;
    }

    let normalized = normalized.trim_start_matches('/').to_string();
    if normalized.is_empty() {
        return None;
    }

    let mut rebuilt = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => rebuilt.push(value),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if rebuilt.as_os_str().is_empty() {
        return None;
    }

    Some(files::normalize_rel_path(&rebuilt))
}

fn sanitize_workspace_rel_paths(paths: Vec<String>) -> Vec<String> {
    let mut sanitized = paths
        .into_iter()
        .filter_map(|path| sanitize_workspace_rel_path(&path))
        .collect::<Vec<_>>();
    sanitized.sort();
    sanitized.dedup();
    sanitized
}

fn normalized_workspace_key(workspace_root: &Path) -> Result<String> {
    let canonical_root = canonicalize_workspace_root(workspace_root)?;
    Ok(normalize_workspace_path(&canonical_root))
}

pub(super) fn find_vault_id(conn: &Connection, workspace_root: &Path) -> Result<Option<i64>> {
    let workspace_key = normalized_workspace_key(workspace_root)?;

    conn.query_row(
        "SELECT id FROM vault WHERE workspace_root = ?1",
        params![workspace_key],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .context("Failed to resolve vault id")
}

pub(super) fn ensure_vault(conn: &Connection, workspace_root: &Path) -> Result<i64> {
    let workspace_key = normalized_workspace_key(workspace_root)?;

    conn.query_row(
        "INSERT INTO vault (workspace_root) VALUES (?1)
         ON CONFLICT(workspace_root) DO UPDATE SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         RETURNING id",
        params![workspace_key],
        |row| row.get::<_, i64>(0),
    )
    .context("Failed to upsert vault row")
}

pub fn index_workspace(
    workspace_root: &Path,
    db_path: &Path,
    embedding_provider: &str,
    embedding_model: &str,
    force_reindex: bool,
) -> Result<IndexSummary> {
    let _ = canonicalize_workspace_root(workspace_root)?;
    let markdown_files = collect_markdown_files(workspace_root)?;
    run_indexing_for_files(
        workspace_root,
        db_path,
        embedding_provider,
        embedding_model,
        markdown_files,
        true,
        force_reindex,
    )
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some(ext) if ext.eq_ignore_ascii_case("md")
    )
}

fn build_single_markdown_file(
    workspace_root: &Path,
    note_path: &Path,
) -> Result<files::MarkdownFile> {
    if !is_markdown_path(note_path) {
        return Err(anyhow!(
            "Note path must point to a markdown file (.md): {}",
            note_path.display()
        ));
    }

    let workspace_canonical = canonicalize_workspace_root(workspace_root)?;
    let note_canonical = fs::canonicalize(note_path)
        .with_context(|| format!("Failed to canonicalize note path {}", note_path.display()))?;

    if !note_canonical.is_file() {
        return Err(anyhow!("Note path is not a file: {}", note_path.display()));
    }

    let rel_path = note_canonical
        .strip_prefix(&workspace_canonical)
        .map_err(|_| anyhow!("Note path is outside workspace: {}", note_path.display()))?;
    let rel_path = files::normalize_rel_path(rel_path);
    Ok(files::MarkdownFile::from_abs_and_rel(
        note_canonical,
        rel_path,
    ))
}

fn run_indexing_for_files(
    workspace_root: &Path,
    db_path: &Path,
    embedding_provider: &str,
    embedding_model: &str,
    files: Vec<files::MarkdownFile>,
    prune_deleted_docs: bool,
    force_reindex: bool,
) -> Result<IndexSummary> {
    let embedding_context = create_embedding_context(embedding_provider, embedding_model)?;
    let mut conn = open_indexing_connection(db_path)?;
    let vault_id = ensure_vault(&conn, workspace_root)?;

    if !force_reindex {
        if let Some(embedding) = embedding_context.as_ref() {
            ensure_embedding_dimension_compatible(&conn, vault_id, embedding.target_dim)?;
        }
    }

    // Force reindex wipes doc/segment tables so they can be recreated cleanly.
    let reset_deleted = if force_reindex {
        if embedding_context.is_some() {
            clear_segment_vectors_for_vault(&conn, vault_id)?;
        }
        clear_index(&conn, vault_id)?
    } else {
        0
    };

    let mut summary = IndexSummary {
        files_discovered: files.len(),
        docs_deleted: reset_deleted,
        ..Default::default()
    };

    sync_documents_with_prune(
        &mut conn,
        workspace_root,
        vault_id,
        files,
        embedding_context.as_ref(),
        &mut summary,
        prune_deleted_docs,
    )?;

    Ok(summary)
}

pub fn index_note(
    workspace_root: &Path,
    db_path: &Path,
    note_path: &Path,
    embedding_provider: &str,
    embedding_model: &str,
) -> Result<IndexSummary> {
    let _ = canonicalize_workspace_root(workspace_root)?;
    let file = build_single_markdown_file(workspace_root, note_path)?;
    run_indexing_for_files(
        workspace_root,
        db_path,
        embedding_provider,
        embedding_model,
        vec![file],
        false,
        false,
    )
}

fn ensure_embedding_dimension_compatible(
    conn: &Connection,
    vault_id: i64,
    target_dim: i32,
) -> Result<()> {
    let mismatch_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) \
             FROM doc \
             WHERE vault_id = ?1 \
               AND last_hash IS NOT NULL \
               AND last_embedding_dim IS NOT NULL \
               AND last_embedding_dim != ?2",
            params![vault_id, target_dim],
            |row| row.get(0),
        )
        .context("Failed to check embedding dimension compatibility")?;

    if mismatch_count > 0 {
        return Err(anyhow!(
            "Existing index uses a different embedding dimension. Re-run indexing with force_reindex=true."
        ));
    }

    Ok(())
}

pub fn get_indexing_meta(workspace_root: &Path, db_path: &Path) -> Result<IndexingMeta> {
    let _ = canonicalize_workspace_root(workspace_root)?;
    let conn = open_indexing_connection(db_path)?;

    let Some(vault_id) = find_vault_id(&conn, workspace_root)? else {
        return Ok(IndexingMeta {
            indexed_doc_count: 0,
        });
    };

    Ok(IndexingMeta {
        indexed_doc_count: count_indexed_docs(&conn, vault_id)?,
    })
}

fn clear_index(conn: &Connection, vault_id: i64) -> Result<usize> {
    let deleted_docs = conn
        .execute("DELETE FROM doc WHERE vault_id = ?1", params![vault_id])
        .context("Failed to clear documents for reindex")?;

    Ok(deleted_docs as usize)
}

fn count_indexed_docs(conn: &Connection, vault_id: i64) -> Result<usize> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM doc WHERE vault_id = ?1 AND last_hash IS NOT NULL",
            params![vault_id],
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
    app_handle: AppHandle,
    workspace_path: String,
    embedding_provider: Option<String>,
    embedding_model: String,
    force_reindex: bool,
) -> Result<IndexSummary, String> {
    let db_path = migrations::run_app_migrations(&app_handle).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(workspace_path);
    let provider = match embedding_provider {
        Some(value) if !value.trim().is_empty() => value,
        _ => "ollama".to_string(),
    };
    let model = embedding_model;

    run_blocking(move || {
        index_workspace(&workspace_path, &db_path, &provider, &model, force_reindex)
    })
    .await
}

#[tauri::command]
pub async fn index_note_command(
    app_handle: AppHandle,
    workspace_path: String,
    note_path: String,
    embedding_provider: Option<String>,
    embedding_model: String,
) -> Result<IndexSummary, String> {
    let db_path = migrations::run_app_migrations(&app_handle).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(workspace_path);
    let note_path = PathBuf::from(note_path);
    let provider = match embedding_provider {
        Some(value) if !value.trim().is_empty() => value,
        _ => "ollama".to_string(),
    };
    let model = embedding_model;

    run_blocking(move || index_note(&workspace_path, &db_path, &note_path, &provider, &model)).await
}

#[tauri::command]
pub fn get_indexing_meta_command(
    app_handle: AppHandle,
    workspace_path: String,
) -> Result<IndexingMeta, String> {
    let db_path = migrations::run_app_migrations(&app_handle).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(workspace_path);
    get_indexing_meta(&workspace_path, &db_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_query_entries_command(
    app_handle: AppHandle,
    workspace_path: String,
    query: String,
    embedding_provider: String,
    embedding_model: String,
) -> Result<Vec<SemanticNoteEntry>, String> {
    let db_path = migrations::run_app_migrations(&app_handle).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(workspace_path);

    run_blocking(move || {
        search_notes_for_query(
            &workspace_path,
            &db_path,
            &query,
            &embedding_provider,
            &embedding_model,
        )
    })
    .await
}

#[tauri::command]
pub async fn resolve_wiki_link_command(
    workspace_path: String,
    current_note_path: Option<String>,
    raw_target: String,
    workspace_rel_paths: Option<Vec<String>>,
) -> Result<ResolveWikiLinkResult, String> {
    let request = ResolveWikiLinkRequest {
        workspace_path,
        current_note_path,
        raw_target,
        workspace_rel_paths,
    };

    run_blocking(move || {
        let workspace_root = canonicalize_workspace_root(Path::new(&request.workspace_path))?;

        let rel_paths = match request.workspace_rel_paths {
            Some(paths) if !paths.is_empty() => sanitize_workspace_rel_paths(paths),
            _ => collect_workspace_rel_paths_for_wiki_resolution(&workspace_root)?,
        };

        let resolved = resolve_wiki_link_target(
            &workspace_root,
            request.current_note_path.as_deref(),
            &request.raw_target,
            &rel_paths,
        );

        Ok(ResolveWikiLinkResult {
            canonical_target: resolved.canonical_target,
            resolved_rel_path: resolved.resolved_rel_path,
            match_count: resolved.match_count,
            disambiguated: resolved.disambiguated,
            unresolved: resolved.unresolved,
        })
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
pub fn get_backlinks(
    workspace_root: &Path,
    db_path: &Path,
    file_path: &Path,
) -> Result<Vec<BacklinkEntry>> {
    // Convert absolute file path to relative path.
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

    let conn = open_indexing_connection(db_path)?;

    let Some(vault_id) = find_vault_id(&conn, workspace_root)? else {
        return Ok(Vec::new());
    };

    // Find the doc ID for the target file.
    let target_doc_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, &rel_path],
            |row| row.get(0),
        )
        .optional()
        .context("Failed to query target document ID")?;

    // Query for backlinks - documents that link to this one.
    // We check both target_doc_id (for resolved links) and target_path (for unresolved).
    let mut backlinks = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT d.rel_path \
         FROM ( \
             SELECT source_doc_id \
             FROM link \
             WHERE target_doc_id = ?2 \
             UNION ALL \
             SELECT source_doc_id \
             FROM link \
             WHERE target_doc_id IS NULL AND target_path = ?3 \
         ) l \
         JOIN doc d ON d.id = l.source_doc_id \
         WHERE d.vault_id = ?1 \
         ORDER BY d.rel_path",
        )
        .context("Failed to prepare backlink query")?;

    let rows = stmt
        .query_map(params![vault_id, target_doc_id, &rel_path], |row| {
            let rel_path: String = row.get(0)?;
            // Extract filename without extension.
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

#[cfg(test)]
mod tests;

#[tauri::command]
pub async fn get_backlinks_command(
    app_handle: AppHandle,
    workspace_path: String,
    file_path: String,
) -> Result<Vec<BacklinkEntry>, String> {
    let db_path = migrations::run_app_migrations(&app_handle).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(workspace_path);
    let file_path = PathBuf::from(file_path);

    run_blocking(move || get_backlinks(&workspace_path, &db_path, &file_path)).await
}
