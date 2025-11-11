use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use walkdir::{DirEntry, WalkDir};

use crate::migrations;

const STATE_DIR_NAME: &str = ".mdit";
const PLACEHOLDER_EMBEDDING_DIM: i32 = 8;
const EMBEDDING_MODEL_KEY: &str = "embedding_model";

#[derive(Debug, Default, Serialize)]
pub struct IndexSummary {
    pub files_discovered: usize,
    pub files_processed: usize,
    pub docs_inserted: usize,
    pub docs_deleted: usize,
    pub segments_created: usize,
    pub segments_updated: usize,
    pub embeddings_written: usize,
    pub skipped_files: Vec<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingMeta {
    pub embedding_model: Option<String>,
    pub indexed_doc_count: usize,
}

struct MarkdownFile {
    abs_path: PathBuf,
    rel_path: String,
}

pub fn index_workspace(
    workspace_root: &Path,
    embedding_model: &str,
    force_reindex: bool,
) -> Result<IndexSummary> {
    if embedding_model.trim().is_empty() {
        return Err(anyhow!("Embedding model must be provided"));
    }

    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    let db_path = migrations::apply_workspace_migrations(workspace_root)?;
    let mut conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", &1)
        .context("Failed to enable foreign keys for workspace database")?;

    let stored_meta = read_embedding_meta(&conn)?;
    let reset_deleted = maybe_reset_index(
        &conn,
        stored_meta.embedding_model.as_deref(),
        embedding_model,
        force_reindex,
    )?;

    persist_embedding_meta(&conn, embedding_model)?;

    let markdown_files = collect_markdown_files(workspace_root)?;
    let placeholder_embedding =
        vec![0u8; PLACEHOLDER_EMBEDDING_DIM as usize * std::mem::size_of::<f32>()];

    let mut summary = IndexSummary {
        files_discovered: markdown_files.len(),
        docs_deleted: reset_deleted,
        ..Default::default()
    };

    sync_documents(
        &mut conn,
        markdown_files,
        &placeholder_embedding,
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

    read_embedding_meta(&conn)
}

fn persist_embedding_meta(conn: &Connection, model: &str) -> Result<()> {
    upsert_meta(conn, EMBEDDING_MODEL_KEY, model)?;
    Ok(())
}

fn upsert_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .with_context(|| format!("Failed to upsert meta key {}", key))?;

    Ok(())
}

fn read_embedding_meta(conn: &Connection) -> Result<IndexingMeta> {
    let embedding_model = fetch_meta_value(conn, EMBEDDING_MODEL_KEY)?;
    let indexed_doc_count = count_indexed_docs(conn)?;

    Ok(IndexingMeta {
        embedding_model,
        indexed_doc_count,
    })
}

fn fetch_meta_value(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .context("Failed to query meta")
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

fn collect_markdown_files(workspace_root: &Path) -> Result<Vec<MarkdownFile>> {
    let walker = WalkDir::new(workspace_root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| should_descend(entry, workspace_root));

    let mut files = Vec::new();
    for entry in walker {
        let entry = entry.with_context(|| "Failed to traverse workspace")?;
        if entry.file_type().is_dir() {
            continue;
        }

        if !is_markdown(entry.path()) {
            continue;
        }

        let rel_path = entry.path().strip_prefix(workspace_root).with_context(|| {
            format!(
                "Failed to compute relative path for {}",
                entry.path().display()
            )
        })?;

        files.push(MarkdownFile {
            abs_path: entry.path().to_path_buf(),
            rel_path: normalize_rel_path(rel_path),
        });
    }

    Ok(files)
}

fn maybe_reset_index(
    conn: &Connection,
    stored_model: Option<&str>,
    requested_model: &str,
    force_reindex: bool,
) -> Result<usize> {
    if let Some(existing) = stored_model {
        if existing != requested_model {
            if force_reindex {
                return clear_index(conn);
            } else {
                return Err(anyhow!(
                    "Embedding model mismatch. Stored '{}', requested '{}'",
                    existing,
                    requested_model
                ));
            }
        }
    }

    if force_reindex {
        return clear_index(conn);
    }

    Ok(0)
}

fn clear_index(conn: &Connection) -> Result<usize> {
    let deleted_docs = conn
        .execute("DELETE FROM doc", [])
        .context("Failed to clear documents for reindex")?;

    conn.execute(
        "DELETE FROM meta WHERE key = ?1",
        params![EMBEDDING_MODEL_KEY],
    )
    .context("Failed to clear embedding metadata")?;

    Ok(deleted_docs as usize)
}

fn should_descend(entry: &DirEntry, workspace_root: &Path) -> bool {
    if entry.path() == workspace_root {
        return true;
    }

    !is_inside_state_dir(entry.path(), workspace_root)
}

fn is_inside_state_dir(path: &Path, workspace_root: &Path) -> bool {
    if let Ok(rel) = path.strip_prefix(workspace_root) {
        if let Some(Component::Normal(component)) = rel.components().next() {
            return component == OsStr::new(STATE_DIR_NAME);
        }
    }
    false
}

fn is_markdown(path: &Path) -> bool {
    matches!(path.extension().and_then(OsStr::to_str), Some(ext) if ext.eq_ignore_ascii_case("md"))
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn sync_documents(
    conn: &mut Connection,
    files: Vec<MarkdownFile>,
    placeholder_embedding: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    let mut existing_docs = load_docs(conn)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?;

    for file in files {
        match process_file(
            conn,
            &file,
            &mut existing_docs,
            placeholder_embedding,
            summary,
        ) {
            Ok(()) => summary.files_processed += 1,
            Err(error) => {
                summary
                    .skipped_files
                    .push(format!("{}: {}", file.abs_path.display(), error));
            }
        }
    }

    Ok(())
}

fn load_docs(conn: &Connection) -> Result<HashMap<String, i64>> {
    let mut stmt = conn
        .prepare("SELECT id, rel_path FROM doc")
        .context("Failed to prepare statement to load documents")?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .context("Failed to read documents")?;

    let mut docs = HashMap::new();
    for row in rows {
        let (id, rel_path) = row?;
        docs.insert(rel_path, id);
    }

    Ok(docs)
}

fn remove_deleted_docs(
    conn: &Connection,
    docs: &mut HashMap<String, i64>,
    discovered: &HashSet<String>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let to_delete: Vec<String> = docs
        .keys()
        .filter(|rel_path| !discovered.contains(*rel_path))
        .cloned()
        .collect();

    for rel_path in to_delete {
        if let Some(doc_id) = docs.remove(&rel_path) {
            conn.execute("DELETE FROM doc WHERE id = ?1", params![doc_id])
                .with_context(|| format!("Failed to delete doc for rel_path {}", rel_path))?;
            summary.docs_deleted += 1;
        }
    }

    Ok(())
}

fn process_file(
    conn: &Connection,
    file: &MarkdownFile,
    docs: &mut HashMap<String, i64>,
    placeholder_embedding: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    let contents = fs::read_to_string(&file.abs_path)
        .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;

    let hash = blake3::hash(contents.as_bytes()).to_hex().to_string();

    let doc_id = match docs.get(&file.rel_path) {
        Some(id) => *id,
        None => {
            conn.execute(
                "INSERT INTO doc (rel_path) VALUES (?1)",
                params![file.rel_path],
            )
            .with_context(|| format!("Failed to insert doc for {}", file.rel_path))?;
            let doc_id = conn.last_insert_rowid();
            docs.insert(file.rel_path.clone(), doc_id);
            summary.docs_inserted += 1;
            doc_id
        }
    };

    sync_segment(conn, doc_id, &hash, placeholder_embedding, summary)?;
    prune_extra_segments(conn, doc_id)?;

    Ok(())
}

fn sync_segment(
    conn: &Connection,
    doc_id: i64,
    content_hash: &str,
    placeholder_embedding: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    let mut stmt = conn
        .prepare("SELECT id, last_hash FROM segment WHERE doc_id = ?1 AND ordinal = 0")
        .context("Failed to prepare segment lookup")?;

    let existing_segment = stmt
        .query_row(params![doc_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .optional()
        .context("Failed to query existing segment")?;

    match existing_segment {
        Some((segment_id, last_hash)) => {
            if last_hash != content_hash {
                conn.execute(
                    "UPDATE segment SET last_hash = ?1 WHERE id = ?2",
                    params![content_hash, segment_id],
                )
                .with_context(|| format!("Failed to update segment for doc {}", doc_id))?;
                summary.segments_updated += 1;
                upsert_embedding(conn, segment_id, placeholder_embedding, summary)?;
            }
        }
        None => {
            conn.execute(
                "INSERT INTO segment (doc_id, ordinal, last_hash) VALUES (?1, 0, ?2)",
                params![doc_id, content_hash],
            )
            .with_context(|| format!("Failed to insert segment for doc {}", doc_id))?;
            let segment_id = conn.last_insert_rowid();
            summary.segments_created += 1;
            upsert_embedding(conn, segment_id, placeholder_embedding, summary)?;
        }
    }

    Ok(())
}

fn prune_extra_segments(conn: &Connection, doc_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM segment WHERE doc_id = ?1 AND ordinal != 0",
        params![doc_id],
    )
    .with_context(|| format!("Failed to prune extra segments for doc {}", doc_id))?;

    Ok(())
}

fn upsert_embedding(
    conn: &Connection,
    segment_id: i64,
    placeholder_embedding: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    conn.execute(
        "INSERT INTO embedding (segment_id, dim, vec) VALUES (?1, ?2, ?3) \
         ON CONFLICT(segment_id) DO UPDATE SET dim = excluded.dim, vec = excluded.vec",
        params![segment_id, PLACEHOLDER_EMBEDDING_DIM, placeholder_embedding],
    )
    .with_context(|| format!("Failed to upsert embedding for segment {}", segment_id))?;

    summary.embeddings_written += 1;
    Ok(())
}
