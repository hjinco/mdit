use std::{
    collections::{HashMap, HashSet},
    convert::TryFrom,
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use ollama_rs::{generation::embeddings::request::GenerateEmbeddingsRequest, Ollama};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::async_runtime;
use walkdir::{DirEntry, WalkDir};

use crate::migrations;

const STATE_DIR_NAME: &str = ".mdit";
const EMBEDDING_MODEL_KEY: &str = "embedding_model";
const EMBEDDING_PROVIDER_KEY: &str = "embedding_provider";

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
    pub embedding_provider: Option<String>,
    pub embedding_model: Option<String>,
    pub indexed_doc_count: usize,
}

struct MarkdownFile {
    abs_path: PathBuf,
    rel_path: String,
}

#[derive(Debug)]
struct EmbeddingVector {
    dim: i32,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmbeddingProvider {
    Ollama,
}

impl EmbeddingProvider {
    fn from_str(value: &str) -> Result<Self> {
        match value.trim().to_lowercase().as_str() {
            "ollama" => Ok(Self::Ollama),
            provider => Err(anyhow!(
                "Unsupported embedding provider '{}'. Only 'ollama' is currently supported.",
                provider
            )),
        }
    }

    fn as_str(&self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
        }
    }
}

enum EmbeddingBackend {
    Ollama(Ollama),
}

struct EmbeddingClient {
    provider: EmbeddingProvider,
    model: String,
    backend: EmbeddingBackend,
}

impl EmbeddingClient {
    fn new(provider: &str, model: &str) -> Result<Self> {
        if model.trim().is_empty() {
            return Err(anyhow!("Embedding model must be provided"));
        }

        let provider = EmbeddingProvider::from_str(provider)?;
        let backend = match provider {
            EmbeddingProvider::Ollama => EmbeddingBackend::Ollama(Ollama::default()),
        };

        Ok(Self {
            provider,
            model: model.to_string(),
            backend,
        })
    }

    fn provider_name(&self) -> &'static str {
        self.provider.as_str()
    }

    fn generate(&self, text: &str) -> Result<EmbeddingVector> {
        match &self.backend {
            EmbeddingBackend::Ollama(ollama) => self.generate_with_ollama(ollama, text),
        }
    }

    fn generate_with_ollama(&self, ollama: &Ollama, text: &str) -> Result<EmbeddingVector> {
        let model = self.model.clone();
        let prompt = text.to_string();

        let response = async_runtime::block_on(async {
            let request = GenerateEmbeddingsRequest::new(model, prompt.into());
            ollama
                .generate_embeddings(request)
                .await
                .context("Failed to generate embeddings with Ollama")
        })?;

        let mut embeddings = response.embeddings.into_iter();
        let vector = embeddings
            .next()
            .ok_or_else(|| anyhow!("Ollama returned an empty embeddings list"))?;

        if vector.is_empty() {
            return Err(anyhow!(
                "Ollama returned an embedding with zero dimensions for model '{}'",
                self.model
            ));
        }

        let dim = i32::try_from(vector.len())
            .map_err(|_| anyhow!("Embedding dimension {} exceeds i32::MAX", vector.len()))?;

        Ok(EmbeddingVector {
            dim,
            bytes: f32_slice_to_le_bytes(&vector),
        })
    }
}

pub fn index_workspace(
    workspace_root: &Path,
    embedding_provider: &str,
    embedding_model: &str,
    force_reindex: bool,
) -> Result<IndexSummary> {
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

    let embedder = EmbeddingClient::new(embedding_provider, embedding_model)?;

    let db_path = migrations::apply_workspace_migrations(workspace_root)?;
    let mut conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", &1)
        .context("Failed to enable foreign keys for workspace database")?;

    let stored_meta = read_embedding_meta(&conn)?;
    let reset_deleted = maybe_reset_index(
        &conn,
        stored_meta.embedding_provider.as_deref(),
        stored_meta.embedding_model.as_deref(),
        embedder.provider_name(),
        embedding_model,
        force_reindex,
    )?;

    persist_embedding_meta(&conn, embedder.provider_name(), embedding_model)?;

    let markdown_files = collect_markdown_files(workspace_root)?;

    let mut summary = IndexSummary {
        files_discovered: markdown_files.len(),
        docs_deleted: reset_deleted,
        ..Default::default()
    };

    sync_documents(&mut conn, markdown_files, &embedder, &mut summary)?;

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

fn persist_embedding_meta(conn: &Connection, provider: &str, model: &str) -> Result<()> {
    upsert_meta(conn, EMBEDDING_PROVIDER_KEY, provider)?;
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
    let embedding_provider = fetch_meta_value(conn, EMBEDDING_PROVIDER_KEY)?;
    let embedding_model = fetch_meta_value(conn, EMBEDDING_MODEL_KEY)?;
    let indexed_doc_count = count_indexed_docs(conn)?;

    Ok(IndexingMeta {
        embedding_provider,
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
    stored_provider: Option<&str>,
    stored_model: Option<&str>,
    requested_provider: &str,
    requested_model: &str,
    force_reindex: bool,
) -> Result<usize> {
    let provider_mismatch = match stored_provider {
        Some(existing) => existing != requested_provider,
        None => stored_model.is_some(),
    };

    let model_mismatch = match stored_model {
        Some(existing) => existing != requested_model,
        None => false,
    };

    if provider_mismatch || model_mismatch {
        if force_reindex {
            return clear_index(conn);
        } else {
            let stored_provider_val = stored_provider.unwrap_or("<unset>");
            let stored_model_val = stored_model.unwrap_or("<unset>");
            return Err(anyhow!(
                "Embedding configuration mismatch. Stored provider/model '{}:{}', requested '{}:{}'. Run with force reindex to rebuild.",
                stored_provider_val,
                stored_model_val,
                requested_provider,
                requested_model
            ));
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
        "DELETE FROM meta WHERE key IN (?1, ?2)",
        params![EMBEDDING_MODEL_KEY, EMBEDDING_PROVIDER_KEY],
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
    embedder: &EmbeddingClient,
    summary: &mut IndexSummary,
) -> Result<()> {
    let mut existing_docs = load_docs(conn)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?;

    for file in files {
        match process_file(conn, &file, &mut existing_docs, embedder, summary) {
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
    embedder: &EmbeddingClient,
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

    sync_segment(conn, doc_id, &hash, &contents, embedder, summary)?;
    prune_extra_segments(conn, doc_id)?;

    Ok(())
}

fn sync_segment(
    conn: &Connection,
    doc_id: i64,
    content_hash: &str,
    contents: &str,
    embedder: &EmbeddingClient,
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
                write_embedding_for_segment(conn, segment_id, contents, embedder, summary)?;
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
            write_embedding_for_segment(conn, segment_id, contents, embedder, summary)?;
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

fn write_embedding_for_segment(
    conn: &Connection,
    segment_id: i64,
    contents: &str,
    embedder: &EmbeddingClient,
    summary: &mut IndexSummary,
) -> Result<()> {
    let embedding = embedder.generate(contents)?;
    upsert_embedding(conn, segment_id, embedding.dim, &embedding.bytes, summary)
}

fn upsert_embedding(
    conn: &Connection,
    segment_id: i64,
    dim: i32,
    embedding_bytes: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    conn.execute(
        "INSERT INTO embedding (segment_id, dim, vec) VALUES (?1, ?2, ?3) \
         ON CONFLICT(segment_id) DO UPDATE SET dim = excluded.dim, vec = excluded.vec",
        params![segment_id, dim, embedding_bytes],
    )
    .with_context(|| format!("Failed to upsert embedding for segment {}", segment_id))?;

    summary.embeddings_written += 1;
    Ok(())
}

fn f32_slice_to_le_bytes(values: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * std::mem::size_of::<f32>());
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}
