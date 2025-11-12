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
    collections::{hash_map::Entry, HashMap, HashSet},
    convert::TryFrom,
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
    sync::OnceLock,
};

use anyhow::{anyhow, Context, Result};
use ollama_rs::{generation::embeddings::request::GenerateEmbeddingsRequest, Ollama};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::async_runtime;
use walkdir::{DirEntry, WalkDir};

use crate::migrations;
use tiktoken_rs::{cl100k_base, CoreBPE};

const STATE_DIR_NAME: &str = ".mdit";
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

/// Cached database representation of a Markdown document.
#[derive(Debug, Clone)]
struct DocRecord {
    id: i64,
    chunking_version: i64,
}

/// Cached representation of a chunk/segment row so we can diff against disk.
#[derive(Debug)]
struct SegmentRecord {
    id: i64,
    last_hash: String,
    embedding_model: Option<String>,
    embedding_dim: Option<i32>,
}

/// Convenience holder for absolute + relative path of a Markdown source file.
struct MarkdownFile {
    abs_path: PathBuf,
    rel_path: String,
}

#[derive(Debug)]
struct EmbeddingVector {
    dim: i32,
    bytes: Vec<u8>,
}

/// Supported providers that can generate embedding vectors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmbeddingProvider {
    Ollama,
}

impl EmbeddingProvider {
    /// Parse human input (e.g., CLI argument) into a provider enum.
    fn from_str(value: &str) -> Result<Self> {
        match value.trim().to_lowercase().as_str() {
            "ollama" => Ok(Self::Ollama),
            provider => Err(anyhow!(
                "Unsupported embedding provider '{}'. Only 'ollama' is currently supported.",
                provider
            )),
        }
    }
}

enum EmbeddingBackend {
    Ollama(Ollama),
}

struct EmbeddingClient {
    model: String,
    backend: EmbeddingBackend,
}

impl EmbeddingClient {
    /// Instantiate a concrete backend client for the requested provider.
    fn new(provider: &str, model: &str) -> Result<Self> {
        if model.trim().is_empty() {
            return Err(anyhow!("Embedding model must be provided"));
        }

        let provider = EmbeddingProvider::from_str(provider)?;
        let backend = match provider {
            EmbeddingProvider::Ollama => EmbeddingBackend::Ollama(Ollama::default()),
        };

        Ok(Self {
            model: model.to_string(),
            backend,
        })
    }

    fn model_name(&self) -> &str {
        &self.model
    }

    /// Generate an embedding vector for the supplied chunk using the selected backend.
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

/// Resolve the embedding dimension for a given provider and model by generating
/// a test embedding and extracting its dimension.
fn resolve_embedding_dimension(provider: &str, model: &str) -> Result<i32> {
    let embedder = EmbeddingClient::new(provider, model)?;
    let test_embedding = embedder.generate("test")?;
    Ok(test_embedding.dim)
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
    let reset_deleted = if force_reindex { clear_index(&conn)? } else { 0 };

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
    // Walk the tree lazily, skipping dot-directories such as the state folder.
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

fn clear_index(conn: &Connection) -> Result<usize> {
    let deleted_docs = conn
        .execute("DELETE FROM doc", [])
        .context("Failed to clear documents for reindex")?;

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
    target_dim: i32,
    summary: &mut IndexSummary,
) -> Result<()> {
    let mut existing_docs = load_docs(conn)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    // Remove rows for files that no longer exist before processing additions/updates.
    remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?;

    for file in files {
        match process_file(
            conn,
            &file,
            &mut existing_docs,
            embedder,
            target_dim,
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

fn load_docs(conn: &Connection) -> Result<HashMap<String, DocRecord>> {
    let mut stmt = conn
        .prepare("SELECT id, rel_path, chunking_version FROM doc")
        .context("Failed to prepare statement to load documents")?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .context("Failed to read documents")?;

    let mut docs = HashMap::new();
    for row in rows {
        let (id, rel_path, chunking_version) = row?;
        docs.insert(
            rel_path,
            DocRecord {
                id,
                chunking_version,
            },
        );
    }

    Ok(docs)
}

fn remove_deleted_docs(
    conn: &Connection,
    docs: &mut HashMap<String, DocRecord>,
    discovered: &HashSet<String>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let to_delete: Vec<String> = docs
        .keys()
        .filter(|rel_path| !discovered.contains(*rel_path))
        .cloned()
        .collect();

    for rel_path in to_delete {
        if let Some(doc) = docs.remove(&rel_path) {
            conn.execute("DELETE FROM doc WHERE id = ?1", params![doc.id])
                .with_context(|| format!("Failed to delete doc for rel_path {}", rel_path))?;
            summary.docs_deleted += 1;
        }
    }

    Ok(())
}

fn process_file(
    conn: &mut Connection,
    file: &MarkdownFile,
    docs: &mut HashMap<String, DocRecord>,
    embedder: &EmbeddingClient,
    target_dim: i32,
    summary: &mut IndexSummary,
) -> Result<()> {
    let contents = fs::read_to_string(&file.abs_path)
        .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;

    let doc_record = match docs.entry(file.rel_path.clone()) {
        Entry::Occupied(entry) => entry.into_mut(),
        Entry::Vacant(entry) => {
            conn.execute(
                "INSERT INTO doc (rel_path, chunking_version) VALUES (?1, ?2)",
                params![file.rel_path, TARGET_CHUNKING_VERSION],
            )
            .with_context(|| format!("Failed to insert doc for {}", file.rel_path))?;
            let doc_id = conn.last_insert_rowid();
            summary.docs_inserted += 1;
            entry.insert(DocRecord {
                id: doc_id,
                chunking_version: TARGET_CHUNKING_VERSION,
            })
        }
    };

    let doc_id = doc_record.id;
    let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);

    if doc_record.chunking_version != TARGET_CHUNKING_VERSION {
        // Chunking algorithm changed, rebuild every segment and embedding.
        rebuild_doc_chunks(
            conn,
            doc_id,
            &chunks,
            embedder,
            summary,
        )?;
        doc_record.chunking_version = TARGET_CHUNKING_VERSION;
    } else {
        // Fast path: only touch segments whose hash/model/dim drifted.
        sync_segments_for_doc(conn, doc_id, &chunks, embedder, target_dim, summary)?;
    }

    Ok(())
}

/// Dispatch to the correct chunker for the requested version.
fn chunk_document(contents: &str, chunking_version: i64) -> Vec<String> {
    match chunking_version {
        1 => chunk_markdown_v1(contents),
        _ => chunk_markdown_v1(contents),
    }
}

fn hash_content(contents: &str) -> String {
    blake3::hash(contents.as_bytes()).to_hex().to_string()
}

const MAX_TOKENS_PER_CHUNK_V1: usize = 1000;

/// Chunk Markdown by major headings and enforce a 1000-token ceiling per chunk.
fn chunk_markdown_v1(contents: &str) -> Vec<String> {
    let sections = split_major_sections(contents);
    let mut chunks = Vec::new();

    for section in sections {
        let section = section.trim();
        if section.is_empty() {
            continue;
        }

        if count_tokens(section) <= MAX_TOKENS_PER_CHUNK_V1 {
            chunks.push(section.to_string());
        } else {
            chunks.extend(split_section_by_tokens(section, MAX_TOKENS_PER_CHUNK_V1));
        }
    }

    if chunks.is_empty() && !contents.trim().is_empty() {
        if count_tokens(contents) <= MAX_TOKENS_PER_CHUNK_V1 {
            chunks.push(contents.trim().to_string());
        } else {
            chunks.extend(split_section_by_tokens(contents, MAX_TOKENS_PER_CHUNK_V1));
        }
    }

    chunks
}

fn split_major_sections(contents: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in contents.lines() {
        let is_heading = is_major_heading_line(line);
        if is_heading {
            if !current.trim().is_empty() {
                sections.push(current.trim().to_string());
            }
            current.clear();
        }

        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }

    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }

    if sections.is_empty() && !contents.trim().is_empty() {
        sections.push(contents.trim().to_string());
    }

    sections
}

fn is_major_heading_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return false;
    }

    let hashes = trimmed.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 2 {
        return false;
    }

    match trimmed.chars().nth(hashes) {
        Some(ch) if ch.is_whitespace() => true,
        None => true,
        _ => false,
    }
}

fn split_section_by_tokens(section: &str, max_tokens: usize) -> Vec<String> {
    if section.trim().is_empty() || max_tokens == 0 {
        return Vec::new();
    }

    let tokenizer = tokenizer();
    let tokens = tokenizer.encode_ordinary(section);
    if tokens.is_empty() {
        return Vec::new();
    }

    tokens
        .chunks(max_tokens)
        .filter_map(|chunk| {
            if chunk.is_empty() {
                return None;
            }

            tokenizer
                .decode(chunk.to_vec())
                .ok()
                .map(|decoded| decoded.trim().to_string())
        })
        .filter(|chunk| !chunk.is_empty())
        .collect()
}

fn count_tokens(text: &str) -> usize {
    tokenizer().encode_ordinary(text).len()
}

fn tokenizer() -> &'static CoreBPE {
    static TOKENIZER: OnceLock<CoreBPE> = OnceLock::new();
    TOKENIZER.get_or_init(|| cl100k_base().expect("failed to initialize cl100k tokenizer"))
}

fn rebuild_doc_chunks(
    conn: &mut Connection,
    doc_id: i64,
    chunks: &[String],
    embedder: &EmbeddingClient,
    summary: &mut IndexSummary,
) -> Result<()> {
    let tx = conn
        .transaction()
        .with_context(|| format!("Failed to start chunk rebuild transaction for doc {}", doc_id))?;

    // Start from a clean slate so we do not mix chunking versions in the same doc.
    tx.execute("DELETE FROM segment WHERE doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear segments for doc {}", doc_id))?;

    for (ordinal, chunk) in chunks.iter().enumerate() {
        let hash = hash_content(chunk);
        let segment_id = insert_segment(&tx, doc_id, ordinal as i64, &hash)?;
        summary.segments_created += 1;
        write_embedding_for_segment(&tx, segment_id, chunk, embedder, summary)?;
    }

    tx.execute(
        "UPDATE doc SET chunking_version = ?1 WHERE id = ?2",
        params![TARGET_CHUNKING_VERSION, doc_id],
    )
    .with_context(|| format!("Failed to update chunking version for doc {}", doc_id))?;

    tx.commit()
        .with_context(|| format!("Failed to commit chunk rebuild for doc {}", doc_id))?;

    if chunks.is_empty() {
        // Ensure any stale rows are removed even if the document produced zero chunks.
        prune_extra_segments(conn, doc_id, 0)?;
    }

    Ok(())
}

fn sync_segments_for_doc(
    conn: &Connection,
    doc_id: i64,
    chunks: &[String],
    embedder: &EmbeddingClient,
    target_dim: i32,
    summary: &mut IndexSummary,
) -> Result<()> {
    let existing = load_segments_for_doc(conn, doc_id)?;

    for (ordinal, chunk) in chunks.iter().enumerate() {
        let hash = hash_content(chunk);
        let ordinal_key = ordinal as i64;
        if let Some(segment) = existing.get(&ordinal_key) {
            let hash_changed = segment.last_hash != hash;
            if hash_changed {
                conn.execute(
                    "UPDATE segment SET last_hash = ?1 WHERE id = ?2",
                    params![hash, segment.id],
                )
                .with_context(|| format!("Failed to update segment {} for doc {}", segment.id, doc_id))?;
                summary.segments_updated += 1;
            }

            let mut needs_embedding = hash_changed;
            if !needs_embedding {
                // Re-embed if the stored metadata indicates a different model/dimension.
                let model_mismatch = segment
                    .embedding_model
                    .as_deref()
                    .map(|model| model != embedder.model_name())
                    .unwrap_or(true);
                let dim_mismatch = segment
                    .embedding_dim
                    .map(|dim| dim != target_dim)
                    .unwrap_or(true);
                needs_embedding = model_mismatch || dim_mismatch;
            }

            if needs_embedding {
                write_embedding_for_segment(conn, segment.id, chunk, embedder, summary)?;
            }
        } else {
            let segment_id = insert_segment(conn, doc_id, ordinal_key, &hash)?;
            summary.segments_created += 1;
            if let Err(error) = write_embedding_for_segment(conn, segment_id, chunk, embedder, summary) {
                // Best-effort cleanup keeps the database consistent if embedding generation fails.
                let cleanup_result = conn.execute(
                    "DELETE FROM segment WHERE id = ?1",
                    params![segment_id],
                );
                if let Err(cleanup_err) = cleanup_result {
                    return Err(error).context(anyhow!(
                        "Failed to clean up segment {} after embedding error: {}",
                        segment_id,
                        cleanup_err
                    ));
                }

                return Err(error).context("Failed to write embedding for new segment");
            }
        }
    }

    prune_extra_segments(conn, doc_id, chunks.len())
}

fn load_segments_for_doc(conn: &Connection, doc_id: i64) -> Result<HashMap<i64, SegmentRecord>> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.ordinal, s.last_hash, e.model, e.dim \
             FROM segment s \
             LEFT JOIN embedding e ON e.segment_id = s.id \
             WHERE s.doc_id = ?1",
        )
        .with_context(|| format!("Failed to prepare segment load for doc {}", doc_id))?;

    let rows = stmt
        .query_map(params![doc_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<i32>>(4)?,
            ))
        })
        .with_context(|| format!("Failed to load segments for doc {}", doc_id))?;

    let mut segments = HashMap::new();
    for row in rows {
        let (id, ordinal, last_hash, embedding_model, embedding_dim) = row?;
        segments.insert(
            ordinal,
            SegmentRecord {
                id,
                last_hash,
                embedding_model,
                embedding_dim,
            },
        );
    }

    Ok(segments)
}

fn insert_segment(conn: &Connection, doc_id: i64, ordinal: i64, last_hash: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO segment (doc_id, ordinal, last_hash) VALUES (?1, ?2, ?3)",
        params![doc_id, ordinal, last_hash],
    )
    .with_context(|| format!("Failed to insert segment {} for doc {}", ordinal, doc_id))?;

    Ok(conn.last_insert_rowid())
}

fn prune_extra_segments(conn: &Connection, doc_id: i64, desired_segments: usize) -> Result<()> {
    conn.execute(
        "DELETE FROM segment WHERE doc_id = ?1 AND ordinal >= ?2",
        params![doc_id, desired_segments as i64],
    )
    .with_context(|| format!("Failed to prune segments for doc {}", doc_id))?;

    Ok(())
}

fn write_embedding_for_segment(
    conn: &Connection,
    segment_id: i64,
    contents: &str,
    embedder: &EmbeddingClient,
    summary: &mut IndexSummary,
) -> Result<()> {
    // Embedding is computed outside SQL so we only persist the binary payload.
    let embedding = embedder.generate(contents)?;
    upsert_embedding(
        conn,
        segment_id,
        embedder.model_name(),
        embedding.dim,
        &embedding.bytes,
        summary,
    )
}

fn upsert_embedding(
    conn: &Connection,
    segment_id: i64,
    model: &str,
    dim: i32,
    embedding_bytes: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    conn.execute(
        "INSERT INTO embedding (segment_id, model, dim, vec) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(segment_id) DO UPDATE SET model = excluded.model, dim = excluded.dim, vec = excluded.vec",
        params![segment_id, model, dim, embedding_bytes],
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
