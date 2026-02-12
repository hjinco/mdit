use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection};

use super::{
    chunking::{chunk_document, hash_content},
    embedding::{EmbeddingClient, EmbeddingVector},
    files::MarkdownFile,
    links::{LinkResolver, ResolvedLink},
    EmbeddingContext, IndexSummary, TARGET_CHUNKING_VERSION,
};

const SEGMENT_VEC_TABLE: &str = "segment_vec";

#[derive(Debug, Clone)]
struct DocRecord {
    id: i64,
    chunking_version: i64,
    last_hash: Option<String>,
    last_embedding_model: Option<String>,
    last_embedding_dim: Option<i32>,
}

impl DocRecord {
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
}

fn embedding_target_changed(doc_record: &DocRecord, model: &str, target_dim: i32) -> bool {
    doc_record.last_embedding_model.as_deref() != Some(model)
        || doc_record.last_embedding_dim != Some(target_dim)
}

#[derive(Debug)]
struct SegmentRecord {
    id: i64,
    last_hash: String,
    has_embedding: bool,
}

pub(super) fn ensure_segment_vec_table(conn: &Connection, target_dim: i32) -> Result<()> {
    let statement = format!(
        "CREATE VIRTUAL TABLE IF NOT EXISTS {SEGMENT_VEC_TABLE} USING vec0(embedding float[{target_dim}])"
    );
    conn.execute_batch(&statement)
        .with_context(|| format!("Failed to ensure {} vec0 table", SEGMENT_VEC_TABLE))?;
    Ok(())
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

    if prune_deleted_docs {
        // Remove rows for files that no longer exist before processing additions/updates.
        remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?;
    }

    let inserted_docs = ensure_docs_for_files(conn, vault_id, &files, &mut existing_docs, summary)?;
    let refresh_all_links = inserted_docs > 0 || (prune_deleted_docs && summary.docs_deleted > 0);
    let docs_by_path = existing_docs
        .iter()
        .map(|(rel_path, doc)| (rel_path.clone(), doc.id))
        .collect::<HashMap<_, _>>();
    let link_resolver = LinkResolver::new(workspace_root, docs_by_path);

    for file in files {
        match process_file(
            conn,
            &file,
            &mut existing_docs,
            &link_resolver,
            refresh_all_links,
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
            "SELECT id, rel_path, chunking_version, last_hash, last_embedding_model, last_embedding_dim \
             FROM doc WHERE vault_id = ?1",
        )
        .context("Failed to prepare statement to load documents")?;

    let rows = stmt
        .query_map(params![vault_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i32>>(5)?,
            ))
        })
        .context("Failed to read documents")?;

    let mut docs = HashMap::new();
    for row in rows {
        let (id, rel_path, chunking_version, last_hash, last_model, last_dim) = row?;
        docs.insert(
            rel_path,
            DocRecord {
                id,
                chunking_version,
                last_hash,
                last_embedding_model: last_model,
                last_embedding_dim: last_dim,
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
            delete_vectors_for_doc(conn, doc.id)?;
            conn.execute("DELETE FROM doc WHERE id = ?1", params![doc.id])
                .with_context(|| format!("Failed to delete doc for rel_path {}", rel_path))?;
            summary.docs_deleted += 1;
        }
    }

    Ok(())
}

fn ensure_docs_for_files(
    conn: &Connection,
    vault_id: i64,
    files: &[MarkdownFile],
    docs: &mut HashMap<String, DocRecord>,
    summary: &mut IndexSummary,
) -> Result<usize> {
    let mut inserted = 0usize;
    for file in files {
        if docs.contains_key(&file.rel_path) {
            continue;
        }

        conn.execute(
            "INSERT INTO doc (vault_id, rel_path, chunking_version, last_hash, last_embedding_model, last_embedding_dim, content) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                vault_id,
                file.rel_path,
                TARGET_CHUNKING_VERSION,
                Option::<String>::None,
                Option::<String>::None,
                Option::<i32>::None,
                ""
            ],
        )
        .with_context(|| format!("Failed to insert doc for {}", file.rel_path))?;

        let doc_id = conn.last_insert_rowid();
        summary.docs_inserted += 1;
        inserted += 1;
        docs.insert(
            file.rel_path.clone(),
            DocRecord {
                id: doc_id,
                chunking_version: TARGET_CHUNKING_VERSION,
                last_hash: None,
                last_embedding_model: None,
                last_embedding_dim: None,
            },
        );
    }

    Ok(inserted)
}

fn process_file(
    conn: &mut Connection,
    file: &MarkdownFile,
    docs: &mut HashMap<String, DocRecord>,
    link_resolver: &LinkResolver,
    refresh_all_links: bool,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let contents = fs::read_to_string(&file.abs_path)
        .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;
    let doc_hash = hash_content(&contents);
    let indexed_content = crate::markdown_text::format_indexing_text(&contents);

    let doc_record = docs
        .get_mut(&file.rel_path)
        .ok_or_else(|| anyhow!("Missing document row for {} during indexing", file.rel_path))?;

    let doc_id = doc_record.id;
    let hash_changed = !doc_record.links_up_to_date(&doc_hash);

    if refresh_all_links || hash_changed {
        let links = link_resolver.resolve_links(file, &contents);
        replace_links_for_doc(conn, doc_id, &links, summary)?;
    }

    let Some(embedding) = embedding else {
        if refresh_all_links || hash_changed {
            update_doc_hash_and_content(conn, doc_record, &doc_hash, &indexed_content)?;
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
        &embedding.embedder,
        embedding.target_dim,
    )
}

fn update_doc_metadata(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    indexed_content: &str,
    embedder: &EmbeddingClient,
    target_dim: i32,
) -> Result<()> {
    let model = embedder.model_name();
    conn.execute(
        "UPDATE doc \
         SET chunking_version = ?1, last_hash = ?2, last_embedding_model = ?3, last_embedding_dim = ?4, content = ?5 \
         WHERE id = ?6",
        params![
            TARGET_CHUNKING_VERSION,
            doc_hash,
            model,
            target_dim,
            indexed_content,
            doc_record.id
        ],
    )
    .with_context(|| format!("Failed to update doc metadata {}", doc_record.id))?;

    doc_record.chunking_version = TARGET_CHUNKING_VERSION;
    doc_record.last_hash = Some(doc_hash.to_string());
    doc_record.last_embedding_model = Some(model.to_string());
    doc_record.last_embedding_dim = Some(target_dim);

    Ok(())
}

fn update_doc_hash_and_content(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    indexed_content: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE doc SET last_hash = ?1, content = ?2 WHERE id = ?3",
        params![doc_hash, indexed_content, doc_record.id],
    )
    .with_context(|| format!("Failed to update doc hash {}", doc_record.id))?;

    doc_record.last_hash = Some(doc_hash.to_string());

    Ok(())
}

fn replace_links_for_doc(
    conn: &mut Connection,
    doc_id: i64,
    links: &[ResolvedLink],
    summary: &mut IndexSummary,
) -> Result<()> {
    let tx = conn
        .transaction()
        .with_context(|| format!("Failed to start link transaction for doc {}", doc_id))?;

    let deleted = tx
        .execute("DELETE FROM link WHERE source_doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear links for doc {}", doc_id))?;
    summary.links_deleted += deleted as usize;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO link (source_doc_id, target_doc_id, target_path) \
             VALUES (?1, ?2, ?3)",
            )
            .with_context(|| format!("Failed to prepare link insert for doc {}", doc_id))?;
        for link in links {
            stmt.execute(params![
                doc_id,
                link.target_doc_id,
                link.target_path.as_str(),
            ])
            .with_context(|| format!("Failed to insert link for doc {}", doc_id))?;
            summary.links_written += 1;
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
    use super::{embedding_target_changed, DocRecord};

    fn make_doc(model: Option<&str>, dim: Option<i32>) -> DocRecord {
        DocRecord {
            id: 1,
            chunking_version: 2,
            last_hash: Some("hash".to_string()),
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
