use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, Row};

use super::{
    chunking::{chunk_document, hash_content},
    embedding::{EmbeddingClient, EmbeddingVector},
    files::MarkdownFile,
    links::{LinkResolution, LinkResolver},
    EmbeddingContext, IndexSummary, TARGET_CHUNKING_VERSION,
};

const SEGMENT_VEC_TABLE: &str = "segment_vec";

#[derive(Debug, Clone)]
struct DocRecord {
    id: i64,
    chunking_version: i64,
    last_hash: Option<String>,
    last_source_size: Option<i64>,
    last_source_mtime_ns: Option<i64>,
    last_embedding_model: Option<String>,
    last_embedding_dim: Option<i32>,
}

impl DocRecord {
    fn from_db_row(row: &Row<'_>) -> rusqlite::Result<(String, Self)> {
        let rel_path = row.get::<_, String>(1)?;
        let record = Self {
            id: row.get::<_, i64>(0)?,
            chunking_version: row.get::<_, i64>(2)?,
            last_hash: row.get::<_, Option<String>>(3)?,
            last_source_size: row.get::<_, Option<i64>>(4)?,
            last_source_mtime_ns: row.get::<_, Option<i64>>(5)?,
            last_embedding_model: row.get::<_, Option<String>>(6)?,
            last_embedding_dim: row.get::<_, Option<i32>>(7)?,
        };
        Ok((rel_path, record))
    }

    fn is_up_to_date(&self, doc_hash: &str, model: &str, target_dim: i32) -> bool {
        self.last_hash
            .as_deref()
            .map(|hash| hash == doc_hash)
            .unwrap_or(false)
            && self
                .last_embedding_model
                .as_deref()
                .map(|stored| stored == model)
                .unwrap_or(false)
            && self
                .last_embedding_dim
                .map(|dim| dim == target_dim)
                .unwrap_or(false)
    }

    fn links_up_to_date(&self, doc_hash: &str) -> bool {
        self.last_hash
            .as_deref()
            .map(|hash| hash == doc_hash)
            .unwrap_or(false)
    }

    fn source_stat_matches(&self, file: &MarkdownFile) -> bool {
        matches!(
            (
                self.last_source_size,
                self.last_source_mtime_ns,
                file.last_source_size,
                file.last_source_mtime_ns
            ),
            (Some(stored_size), Some(stored_mtime), Some(file_size), Some(file_mtime))
                if stored_size == file_size && stored_mtime == file_mtime
        )
    }

    fn update_source_stat(&mut self, file: &MarkdownFile) {
        self.last_source_size = file.last_source_size;
        self.last_source_mtime_ns = file.last_source_mtime_ns;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileSyncAction {
    Skip,
    Process { source_stat_changed: bool },
}

fn decide_file_sync_action(
    doc_record: &DocRecord,
    file: &MarkdownFile,
    force_link_refresh_for_doc: bool,
    embedding: Option<&EmbeddingContext>,
) -> FileSyncAction {
    let source_stat_changed = !doc_record.source_stat_matches(file);
    if !force_link_refresh_for_doc
        && !source_stat_changed
        && doc_record.chunking_version == TARGET_CHUNKING_VERSION
        && doc_record.last_hash.is_some()
        && embedding_target_matches(doc_record, embedding)
    {
        return FileSyncAction::Skip;
    }

    FileSyncAction::Process {
        source_stat_changed,
    }
}

enum DocUpdate<'a> {
    SourceStat {
        file: &'a MarkdownFile,
    },
    HashAndContent {
        doc_hash: &'a str,
        indexed_content: &'a str,
        file: &'a MarkdownFile,
    },
    FullMetadata {
        doc_hash: &'a str,
        indexed_content: &'a str,
        file: &'a MarkdownFile,
        model: &'a str,
        target_dim: i32,
    },
}

fn embedding_target_changed(doc_record: &DocRecord, model: &str, target_dim: i32) -> bool {
    doc_record.last_embedding_model.as_deref() != Some(model)
        || doc_record.last_embedding_dim != Some(target_dim)
}

fn embedding_target_matches(doc_record: &DocRecord, embedding: Option<&EmbeddingContext>) -> bool {
    let Some(embedding) = embedding else {
        return true;
    };

    doc_record.last_embedding_model.as_deref() == Some(embedding.embedder.model_name())
        && doc_record.last_embedding_dim == Some(embedding.target_dim)
}

#[derive(Debug)]
struct SegmentRecord {
    id: i64,
    last_hash: String,
    has_embedding: bool,
}

pub(super) fn clear_segment_vectors_for_vault(conn: &Connection, vault_id: i64) -> Result<()> {
    if !segment_vec_table_exists(conn)? {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM segment_vec \
         WHERE rowid IN ( \
             SELECT s.id \
             FROM segment s \
             JOIN doc d ON d.id = s.doc_id \
             WHERE d.vault_id = ?1 \
         )",
        params![vault_id],
    )
    .with_context(|| format!("Failed to clear vectors for vault {}", vault_id))?;

    Ok(())
}

pub(crate) fn sync_documents_with_prune(
    conn: &mut Connection,
    workspace_root: &Path,
    vault_id: i64,
    files: Vec<MarkdownFile>,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
    prune_deleted_docs: bool,
) -> Result<()> {
    let mut existing_docs = load_docs(conn, vault_id)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    let deleted_rel_paths = if prune_deleted_docs {
        // Remove rows for files that no longer exist before processing additions/updates.
        remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?
    } else {
        Vec::new()
    };

    let inserted_docs = ensure_docs_for_files(conn, vault_id, &files, &mut existing_docs, summary)?;
    bind_unresolved_links_for_inserted_docs(conn, &inserted_docs)?;
    let mut affected_query_keys = collect_query_keys_for_paths(&deleted_rel_paths);
    for (rel_path, _doc_id) in &inserted_docs {
        for key in rel_path_query_keys(rel_path) {
            affected_query_keys.insert(key);
        }
    }
    let forced_link_refresh_doc_ids =
        load_forced_link_refresh_doc_ids(conn, vault_id, &affected_query_keys)?;
    let docs_by_path = existing_docs
        .iter()
        .map(|(rel_path, doc)| (rel_path.clone(), doc.id))
        .collect::<HashMap<_, _>>();
    let link_resolver = LinkResolver::new(workspace_root, docs_by_path);

    for file in files {
        let force_link_refresh_for_doc = existing_docs
            .get(&file.rel_path)
            .map(|doc| forced_link_refresh_doc_ids.contains(&doc.id))
            .unwrap_or(false);
        match process_file(
            conn,
            &file,
            &mut existing_docs,
            &link_resolver,
            force_link_refresh_for_doc,
            embedding,
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

fn load_docs(conn: &Connection, vault_id: i64) -> Result<HashMap<String, DocRecord>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, rel_path, chunking_version, last_hash, last_source_size, last_source_mtime_ns, \
                    last_embedding_model, last_embedding_dim \
             FROM doc WHERE vault_id = ?1",
        )
        .context("Failed to prepare statement to load documents")?;

    let rows = stmt
        .query_map(params![vault_id], DocRecord::from_db_row)
        .context("Failed to read documents")?;

    let mut docs = HashMap::new();
    for row in rows {
        let (rel_path, doc) = row?;
        docs.insert(rel_path, doc);
    }

    Ok(docs)
}

fn remove_deleted_docs(
    conn: &Connection,
    docs: &mut HashMap<String, DocRecord>,
    discovered: &HashSet<String>,
    summary: &mut IndexSummary,
) -> Result<Vec<String>> {
    let to_delete: Vec<String> = docs
        .keys()
        .filter(|rel_path| !discovered.contains(*rel_path))
        .cloned()
        .collect();

    for rel_path in &to_delete {
        if let Some(doc) = docs.remove(rel_path) {
            delete_vectors_for_doc(conn, doc.id)?;
            conn.execute("DELETE FROM doc WHERE id = ?1", params![doc.id])
                .with_context(|| format!("Failed to delete doc for rel_path {}", rel_path))?;
            summary.docs_deleted += 1;
        }
    }

    Ok(to_delete)
}

fn ensure_docs_for_files(
    conn: &Connection,
    vault_id: i64,
    files: &[MarkdownFile],
    docs: &mut HashMap<String, DocRecord>,
    summary: &mut IndexSummary,
) -> Result<Vec<(String, i64)>> {
    let mut inserted = Vec::new();
    for file in files {
        if docs.contains_key(&file.rel_path) {
            continue;
        }

        conn.execute(
            "INSERT INTO doc (vault_id, rel_path, chunking_version, last_hash, last_source_size, \
                              last_source_mtime_ns, last_embedding_model, last_embedding_dim, content) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                vault_id,
                file.rel_path,
                TARGET_CHUNKING_VERSION,
                Option::<String>::None,
                Option::<i64>::None,
                Option::<i64>::None,
                Option::<String>::None,
                Option::<i32>::None,
                ""
            ],
        )
        .with_context(|| format!("Failed to insert doc for {}", file.rel_path))?;

        let doc_id = conn.last_insert_rowid();
        summary.docs_inserted += 1;
        inserted.push((file.rel_path.clone(), doc_id));
        docs.insert(
            file.rel_path.clone(),
            DocRecord {
                id: doc_id,
                chunking_version: TARGET_CHUNKING_VERSION,
                last_hash: None,
                last_source_size: None,
                last_source_mtime_ns: None,
                last_embedding_model: None,
                last_embedding_dim: None,
            },
        );
    }

    Ok(inserted)
}

fn bind_unresolved_links_for_inserted_docs(
    conn: &Connection,
    inserted_docs: &[(String, i64)],
) -> Result<()> {
    for (rel_path, doc_id) in inserted_docs {
        conn.execute(
            "UPDATE link SET target_doc_id = ?1 \
             WHERE target_doc_id IS NULL AND target_path = ?2",
            params![doc_id, rel_path],
        )
        .with_context(|| {
            format!(
                "Failed to bind unresolved links for inserted doc {} ({})",
                doc_id, rel_path
            )
        })?;
    }

    Ok(())
}

fn collect_query_keys_for_paths(paths: &[String]) -> HashSet<String> {
    let mut keys = HashSet::new();
    for rel_path in paths {
        for key in rel_path_query_keys(rel_path) {
            keys.insert(key);
        }
    }
    keys
}

fn rel_path_query_keys(rel_path: &str) -> HashSet<String> {
    let Some(no_ext_lower) = rel_path_no_ext_lower(rel_path) else {
        return HashSet::new();
    };

    let segments = no_ext_lower
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() {
        return HashSet::new();
    }

    let mut keys = HashSet::new();
    for suffix_len in 1..=segments.len() {
        let key = segments[segments.len() - suffix_len..].join("/");
        if !key.is_empty() {
            keys.insert(key);
        }
    }

    keys
}

fn rel_path_no_ext_lower(rel_path: &str) -> Option<String> {
    let normalized = rel_path.replace('\\', "/").trim().to_string();
    if normalized.is_empty() {
        return None;
    }

    let lower = normalized.to_lowercase();
    if lower.ends_with(".mdx") {
        return normalized
            .get(..normalized.len().saturating_sub(4))
            .map(|value| value.to_lowercase());
    }
    if lower.ends_with(".md") {
        return normalized
            .get(..normalized.len().saturating_sub(3))
            .map(|value| value.to_lowercase());
    }

    Path::new(&normalized)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_lowercase())
}

fn load_forced_link_refresh_doc_ids(
    conn: &Connection,
    vault_id: i64,
    query_keys: &HashSet<String>,
) -> Result<HashSet<i64>> {
    if query_keys.is_empty() {
        return Ok(HashSet::new());
    }

    let mut result = HashSet::new();
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT wr.source_doc_id \
             FROM wiki_link_ref wr \
             JOIN doc d ON d.id = wr.source_doc_id \
             WHERE d.vault_id = ?1 AND wr.query_key = ?2",
        )
        .context("Failed to prepare forced link refresh query")?;

    for query_key in query_keys {
        let rows = stmt
            .query_map(params![vault_id, query_key], |row| row.get::<_, i64>(0))
            .with_context(|| {
                format!(
                    "Failed to query docs requiring forced link refresh for query key '{}'",
                    query_key
                )
            })?;

        for row in rows {
            result.insert(row?);
        }
    }

    Ok(result)
}

fn process_file(
    conn: &mut Connection,
    file: &MarkdownFile,
    docs: &mut HashMap<String, DocRecord>,
    link_resolver: &LinkResolver,
    force_link_refresh_for_doc: bool,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let doc_record = docs
        .get_mut(&file.rel_path)
        .ok_or_else(|| anyhow!("Missing document row for {} during indexing", file.rel_path))?;
    let source_stat_changed =
        match decide_file_sync_action(doc_record, file, force_link_refresh_for_doc, embedding) {
            FileSyncAction::Skip => return Ok(()),
            FileSyncAction::Process {
                source_stat_changed,
            } => source_stat_changed,
        };

    let contents = fs::read_to_string(&file.abs_path)
        .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;
    let doc_hash = hash_content(&contents);
    let indexed_content = crate::markdown_text::format_indexing_text(&contents);

    let doc_id = doc_record.id;
    let hash_changed = !doc_record.links_up_to_date(&doc_hash);

    if force_link_refresh_for_doc || hash_changed {
        let resolution = link_resolver.resolve_links_with_dependencies(file, &contents);
        replace_links_for_doc(conn, doc_id, &resolution, summary)?;
    }

    let Some(embedding) = embedding else {
        if hash_changed {
            apply_doc_update(
                conn,
                doc_record,
                DocUpdate::HashAndContent {
                    doc_hash: &doc_hash,
                    indexed_content: &indexed_content,
                    file,
                },
            )?;
        } else if source_stat_changed {
            apply_doc_update(conn, doc_record, DocUpdate::SourceStat { file })?;
        }
        return Ok(());
    };
    let embedding_target_changed = embedding_target_changed(
        doc_record,
        embedding.embedder.model_name(),
        embedding.target_dim,
    );

    if doc_record.chunking_version != TARGET_CHUNKING_VERSION {
        let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);
        // Chunking algorithm changed, rebuild every segment and embedding.
        rebuild_doc_chunks(conn, doc_id, &chunks, &embedding.embedder, summary)?;
        update_doc_metadata(
            conn,
            doc_record,
            &doc_hash,
            &indexed_content,
            file,
            &embedding.embedder,
            embedding.target_dim,
        )?;
        return Ok(());
    }

    if doc_record.is_up_to_date(
        &doc_hash,
        embedding.embedder.model_name(),
        embedding.target_dim,
    ) {
        if source_stat_changed {
            apply_doc_update(conn, doc_record, DocUpdate::SourceStat { file })?;
        }
        return Ok(());
    }

    let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);
    // Fast path: only touch segments whose hash/vector drifted, unless model target changed.
    sync_segments_for_doc(
        conn,
        doc_id,
        &chunks,
        &embedding.embedder,
        embedding_target_changed,
        summary,
    )?;
    update_doc_metadata(
        conn,
        doc_record,
        &doc_hash,
        &indexed_content,
        file,
        &embedding.embedder,
        embedding.target_dim,
    )
}

fn update_doc_metadata(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    indexed_content: &str,
    file: &MarkdownFile,
    embedder: &EmbeddingClient,
    target_dim: i32,
) -> Result<()> {
    apply_doc_update(
        conn,
        doc_record,
        DocUpdate::FullMetadata {
            doc_hash,
            indexed_content,
            file,
            model: embedder.model_name(),
            target_dim,
        },
    )
}

fn apply_doc_update(
    conn: &Connection,
    doc_record: &mut DocRecord,
    update: DocUpdate<'_>,
) -> Result<()> {
    match update {
        DocUpdate::SourceStat { file } => {
            conn.execute(
                "UPDATE doc SET last_source_size = ?1, last_source_mtime_ns = ?2 WHERE id = ?3",
                params![
                    file.last_source_size,
                    file.last_source_mtime_ns,
                    doc_record.id
                ],
            )
            .with_context(|| format!("Failed to update doc source stat {}", doc_record.id))?;

            doc_record.update_source_stat(file);
        }
        DocUpdate::HashAndContent {
            doc_hash,
            indexed_content,
            file,
        } => {
            conn.execute(
                "UPDATE doc \
                 SET last_hash = ?1, last_source_size = ?2, last_source_mtime_ns = ?3, content = ?4 \
                 WHERE id = ?5",
                params![
                    doc_hash,
                    file.last_source_size,
                    file.last_source_mtime_ns,
                    indexed_content,
                    doc_record.id
                ],
            )
            .with_context(|| format!("Failed to update doc hash {}", doc_record.id))?;

            doc_record.last_hash = Some(doc_hash.to_string());
            doc_record.update_source_stat(file);
        }
        DocUpdate::FullMetadata {
            doc_hash,
            indexed_content,
            file,
            model,
            target_dim,
        } => {
            conn.execute(
                "UPDATE doc \
                 SET chunking_version = ?1, last_hash = ?2, last_source_size = ?3, last_source_mtime_ns = ?4, \
                     last_embedding_model = ?5, last_embedding_dim = ?6, content = ?7 \
                 WHERE id = ?8",
                params![
                    TARGET_CHUNKING_VERSION,
                    doc_hash,
                    file.last_source_size,
                    file.last_source_mtime_ns,
                    model,
                    target_dim,
                    indexed_content,
                    doc_record.id
                ],
            )
            .with_context(|| format!("Failed to update doc metadata {}", doc_record.id))?;

            doc_record.chunking_version = TARGET_CHUNKING_VERSION;
            doc_record.last_hash = Some(doc_hash.to_string());
            doc_record.update_source_stat(file);
            doc_record.last_embedding_model = Some(model.to_string());
            doc_record.last_embedding_dim = Some(target_dim);
        }
    }

    Ok(())
}

fn replace_links_for_doc(
    conn: &mut Connection,
    doc_id: i64,
    resolution: &LinkResolution,
    summary: &mut IndexSummary,
) -> Result<()> {
    let tx = conn
        .transaction()
        .with_context(|| format!("Failed to start link transaction for doc {}", doc_id))?;

    let deleted = tx
        .execute("DELETE FROM link WHERE source_doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear links for doc {}", doc_id))?;
    summary.links_deleted += deleted as usize;
    tx.execute(
        "DELETE FROM wiki_link_ref WHERE source_doc_id = ?1",
        params![doc_id],
    )
    .with_context(|| format!("Failed to clear wiki link refs for doc {}", doc_id))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO link (source_doc_id, target_doc_id, target_path) \
             VALUES (?1, ?2, ?3)",
            )
            .with_context(|| format!("Failed to prepare link insert for doc {}", doc_id))?;
        for link in &resolution.links {
            stmt.execute(params![
                doc_id,
                link.target_doc_id,
                link.target_path.as_str(),
            ])
            .with_context(|| format!("Failed to insert link for doc {}", doc_id))?;
            summary.links_written += 1;
        }
    }
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO wiki_link_ref (source_doc_id, query_key) \
             VALUES (?1, ?2)",
            )
            .with_context(|| {
                format!("Failed to prepare wiki link ref insert for doc {}", doc_id)
            })?;
        for query_key in &resolution.wiki_query_keys {
            stmt.execute(params![doc_id, query_key]).with_context(|| {
                format!(
                    "Failed to insert wiki link ref '{}' for doc {}",
                    query_key, doc_id
                )
            })?;
        }
    }

    tx.commit()
        .with_context(|| format!("Failed to commit links for doc {}", doc_id))?;

    Ok(())
}

fn rebuild_doc_chunks(
    conn: &mut Connection,
    doc_id: i64,
    chunks: &[String],
    embedder: &EmbeddingClient,
    summary: &mut IndexSummary,
) -> Result<()> {
    struct PreparedSegmentEmbedding {
        ordinal: i64,
        hash: String,
        vector: EmbeddingVector,
    }

    // Generate all embeddings before taking the SQLite write lock so readers are not blocked.
    let mut prepared_segments = Vec::with_capacity(chunks.len());
    for (ordinal, chunk) in chunks.iter().enumerate() {
        let hash = hash_content(chunk);
        let vector = embedder.generate(chunk)?;
        prepared_segments.push(PreparedSegmentEmbedding {
            ordinal: ordinal as i64,
            hash,
            vector,
        });
    }

    let tx = conn.transaction().with_context(|| {
        format!(
            "Failed to start chunk rebuild transaction for doc {}",
            doc_id
        )
    })?;

    // Start from a clean slate so we do not mix chunking versions in the same doc.
    delete_vectors_for_doc(&tx, doc_id)?;
    tx.execute("DELETE FROM segment WHERE doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear segments for doc {}", doc_id))?;

    for prepared in &prepared_segments {
        let segment_id = insert_segment(&tx, doc_id, prepared.ordinal, &prepared.hash)?;
        summary.segments_created += 1;
        upsert_embedding(&tx, segment_id, &prepared.vector.bytes, summary)?;
    }

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
    force_reembed_all: bool,
    summary: &mut IndexSummary,
) -> Result<()> {
    let existing = load_segments_for_doc(conn, doc_id)?;

    for (ordinal, chunk) in chunks.iter().enumerate() {
        let hash = hash_content(chunk);
        let ordinal_key = ordinal as i64;
        if let Some(segment) = existing.get(&ordinal_key) {
            let hash_changed = segment.last_hash != hash;
            let mut needs_embedding = force_reembed_all || hash_changed;
            if !needs_embedding {
                // Re-embed if the segment is missing a stored vector.
                needs_embedding = !segment.has_embedding;
            }

            if needs_embedding {
                write_embedding_for_segment(conn, segment.id, chunk, embedder, summary)?;
                if hash_changed {
                    conn.execute(
                        "UPDATE segment SET last_hash = ?1 WHERE id = ?2",
                        params![hash, segment.id],
                    )
                    .with_context(|| {
                        format!("Failed to update segment {} for doc {}", segment.id, doc_id)
                    })?;
                    summary.segments_updated += 1;
                }
            }
        } else {
            let segment_id = insert_segment(conn, doc_id, ordinal_key, &hash)?;
            summary.segments_created += 1;
            if let Err(error) =
                write_embedding_for_segment(conn, segment_id, chunk, embedder, summary)
            {
                // Best-effort cleanup keeps the database consistent if embedding generation fails.
                let cleanup_result: Result<()> = (|| {
                    delete_vector_for_segment(conn, segment_id)?;
                    conn.execute("DELETE FROM segment WHERE id = ?1", params![segment_id])
                        .with_context(|| {
                            format!("Failed to delete segment {} during cleanup", segment_id)
                        })?;
                    Ok(())
                })();
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

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::{embedding_target_changed, upsert_embedding, DocRecord, IndexSummary};

    fn open_connection() -> Connection {
        crate::sqlite_vec_ext::register_auto_extension().expect("failed to register sqlite-vec");

        let conn = Connection::open_in_memory().expect("failed to open in-memory db");
        conn.pragma_update(None, "foreign_keys", 1)
            .expect("failed to enable foreign keys");
        conn.execute_batch("CREATE TABLE segment (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL)")
            .expect("failed to create segment table");
        conn
    }

    fn embedding_bytes(dim: usize) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(dim * 4);
        for index in 0..dim {
            bytes.extend_from_slice(&((index as f32) + 1.0).to_le_bytes());
        }
        bytes
    }

    fn make_doc(model: Option<&str>, dim: Option<i32>) -> DocRecord {
        DocRecord {
            id: 1,
            chunking_version: 2,
            last_hash: Some("hash".to_string()),
            last_source_size: Some(10),
            last_source_mtime_ns: Some(20),
            last_embedding_model: model.map(|value| value.to_string()),
            last_embedding_dim: dim,
        }
    }

    #[test]
    fn embedding_target_unchanged_returns_false() {
        let doc = make_doc(Some("nomic-embed-text"), Some(768));
        assert!(!embedding_target_changed(&doc, "nomic-embed-text", 768));
    }

    #[test]
    fn embedding_target_changed_returns_true_for_model_or_dim_drift() {
        let doc = make_doc(Some("nomic-embed-text"), Some(768));
        assert!(embedding_target_changed(&doc, "other-model", 768));
        assert!(embedding_target_changed(&doc, "nomic-embed-text", 1024));
    }

    #[test]
    fn embedding_target_changed_returns_true_when_metadata_missing() {
        let doc = make_doc(None, None);
        assert!(embedding_target_changed(&doc, "nomic-embed-text", 768));
    }

    #[test]
    fn given_plain_segment_vec_when_upserting_different_dimensions_then_writes_succeed() {
        let conn = open_connection();
        conn.execute_batch(
            "CREATE TABLE segment_vec ( \
                 rowid INTEGER PRIMARY KEY, \
                 embedding BLOB NOT NULL, \
                 FOREIGN KEY (rowid) REFERENCES segment(id) ON DELETE CASCADE \
             )",
        )
        .expect("failed to create segment_vec table");

        conn.execute("INSERT INTO segment (id) VALUES (?1)", params![1])
            .expect("failed to insert segment 1");
        conn.execute("INSERT INTO segment (id) VALUES (?1)", params![2])
            .expect("failed to insert segment 2");

        let mut summary = IndexSummary::default();
        let first_embedding = embedding_bytes(768);
        let second_embedding = embedding_bytes(1024);

        upsert_embedding(&conn, 1, &first_embedding, &mut summary)
            .expect("failed to write first embedding");
        upsert_embedding(&conn, 2, &second_embedding, &mut summary)
            .expect("failed to write second embedding");

        let first_len: i64 = conn
            .query_row(
                "SELECT length(embedding) FROM segment_vec WHERE rowid = ?1",
                params![1],
                |row| row.get(0),
            )
            .expect("failed to read first embedding length");
        let second_len: i64 = conn
            .query_row(
                "SELECT length(embedding) FROM segment_vec WHERE rowid = ?1",
                params![2],
                |row| row.get(0),
            )
            .expect("failed to read second embedding length");

        assert_eq!(first_len, (768 * 4) as i64);
        assert_eq!(second_len, (1024 * 4) as i64);
        assert_eq!(summary.embeddings_written, 2);
    }
}

fn load_segments_for_doc(conn: &Connection, doc_id: i64) -> Result<HashMap<i64, SegmentRecord>> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.ordinal, s.last_hash, sv.rowid \
             FROM segment s \
             LEFT JOIN segment_vec sv ON sv.rowid = s.id \
             WHERE s.doc_id = ?1",
        )
        .with_context(|| format!("Failed to prepare segment load for doc {}", doc_id))?;

    let rows = stmt
        .query_map(params![doc_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?.is_some(),
            ))
        })
        .with_context(|| format!("Failed to load segments for doc {}", doc_id))?;

    let mut segments = HashMap::new();
    for row in rows {
        let (id, ordinal, last_hash, has_embedding) = row?;
        segments.insert(
            ordinal,
            SegmentRecord {
                id,
                last_hash,
                has_embedding,
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
    delete_vectors_for_pruned_segments(conn, doc_id, desired_segments as i64)?;
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
    upsert_embedding(conn, segment_id, &embedding.bytes, summary)
}

fn upsert_embedding(
    conn: &Connection,
    segment_id: i64,
    embedding_bytes: &[u8],
    summary: &mut IndexSummary,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO segment_vec (rowid, embedding) VALUES (?1, vec_f32(?2))",
        params![segment_id, embedding_bytes],
    )
    .with_context(|| format!("Failed to upsert embedding for segment {}", segment_id))?;

    summary.embeddings_written += 1;
    Ok(())
}

fn segment_vec_table_exists(conn: &Connection) -> Result<bool> {
    let exists: i64 = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            params![SEGMENT_VEC_TABLE],
            |row| row.get(0),
        )
        .context("Failed to check segment_vec table existence")?;

    Ok(exists != 0)
}

fn delete_vector_for_segment(conn: &Connection, segment_id: i64) -> Result<()> {
    if !segment_vec_table_exists(conn)? {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM segment_vec WHERE rowid = ?1",
        params![segment_id],
    )
    .with_context(|| format!("Failed to delete vector for segment {}", segment_id))?;
    Ok(())
}

fn delete_vectors_for_doc(conn: &Connection, doc_id: i64) -> Result<()> {
    if !segment_vec_table_exists(conn)? {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM segment_vec \
         WHERE rowid IN (SELECT id FROM segment WHERE doc_id = ?1)",
        params![doc_id],
    )
    .with_context(|| format!("Failed to delete vectors for doc {}", doc_id))?;

    Ok(())
}

fn delete_vectors_for_pruned_segments(
    conn: &Connection,
    doc_id: i64,
    start_ordinal: i64,
) -> Result<()> {
    if !segment_vec_table_exists(conn)? {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM segment_vec \
         WHERE rowid IN ( \
             SELECT id \
             FROM segment \
             WHERE doc_id = ?1 AND ordinal >= ?2 \
         )",
        params![doc_id, start_ordinal],
    )
    .with_context(|| format!("Failed to delete pruned vectors for doc {}", doc_id))?;

    Ok(())
}
