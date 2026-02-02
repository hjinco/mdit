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

#[derive(Debug, Clone)]
struct DocRecord {
    id: i64,
    chunking_version: i64,
    last_hash: Option<String>,
    last_embedding_model: Option<String>,
    last_embedding_dim: Option<i32>,
    last_link_hash: Option<String>,
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
        self.last_link_hash
            .as_deref()
            .map(|hash| hash == doc_hash)
            .unwrap_or(false)
    }
}

#[derive(Debug)]
struct SegmentRecord {
    id: i64,
    last_hash: String,
    embedding_model: Option<String>,
    embedding_dim: Option<i32>,
}

pub(crate) fn sync_documents(
    conn: &mut Connection,
    workspace_root: &Path,
    files: Vec<MarkdownFile>,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let mut existing_docs = load_docs(conn)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    // Remove rows for files that no longer exist before processing additions/updates.
    remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?;

    let inserted_docs = ensure_docs_for_files(conn, &files, &mut existing_docs, summary)?;
    let refresh_all_links = inserted_docs > 0 || summary.docs_deleted > 0;
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

fn load_docs(conn: &Connection) -> Result<HashMap<String, DocRecord>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, rel_path, chunking_version, last_hash, last_embedding_model, last_embedding_dim, last_link_hash FROM doc",
        )
        .context("Failed to prepare statement to load documents")?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .context("Failed to read documents")?;

    let mut docs = HashMap::new();
    for row in rows {
        let (id, rel_path, chunking_version, last_hash, last_model, last_dim, last_link_hash) =
            row?;
        docs.insert(
            rel_path,
            DocRecord {
                id,
                chunking_version,
                last_hash: option_from_string(last_hash),
                last_embedding_model: option_from_string(last_model),
                last_embedding_dim: option_from_dim(last_dim),
                last_link_hash: option_from_string(last_link_hash),
            },
        );
    }

    Ok(docs)
}

fn option_from_string(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn option_from_dim(value: i32) -> Option<i32> {
    if value <= 0 {
        None
    } else {
        Some(value)
    }
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

fn ensure_docs_for_files(
    conn: &Connection,
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
            "INSERT INTO doc (rel_path, chunking_version, last_hash, last_link_hash, last_embedding_model, last_embedding_dim) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![file.rel_path, TARGET_CHUNKING_VERSION, "", "", "", 0],
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
                last_link_hash: None,
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

    let doc_record = docs
        .get_mut(&file.rel_path)
        .ok_or_else(|| anyhow!("Missing document row for {} during indexing", file.rel_path))?;

    let doc_id = doc_record.id;

    if refresh_all_links || !doc_record.links_up_to_date(&doc_hash) {
        let links = link_resolver.resolve_links(file, doc_id, &contents);
        replace_links_for_doc(conn, doc_id, &links, summary)?;
        update_doc_link_hash(conn, doc_record, &doc_hash)?;
    }

    let Some(embedding) = embedding else {
        return Ok(());
    };

    if doc_record.chunking_version != TARGET_CHUNKING_VERSION {
        let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);
        // Chunking algorithm changed, rebuild every segment and embedding.
        rebuild_doc_chunks(conn, doc_id, &chunks, &embedding.embedder, summary)?;
        update_doc_metadata(
            conn,
            doc_record,
            &doc_hash,
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
    // Fast path: only touch segments whose hash/model/dim drifted.
    sync_segments_for_doc(
        conn,
        doc_id,
        &chunks,
        &embedding.embedder,
        embedding.target_dim,
        summary,
    )?;
    update_doc_metadata(
        conn,
        doc_record,
        &doc_hash,
        &embedding.embedder,
        embedding.target_dim,
    )
}

fn update_doc_metadata(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    embedder: &EmbeddingClient,
    target_dim: i32,
) -> Result<()> {
    let model = embedder.model_name();
    conn.execute(
        "UPDATE doc SET chunking_version = ?1, last_hash = ?2, last_embedding_model = ?3, last_embedding_dim = ?4 WHERE id = ?5",
        params![
            TARGET_CHUNKING_VERSION,
            doc_hash,
            model,
            target_dim,
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

fn update_doc_link_hash(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE doc SET last_link_hash = ?1 WHERE id = ?2",
        params![doc_hash, doc_record.id],
    )
    .with_context(|| format!("Failed to update doc link hash {}", doc_record.id))?;

    doc_record.last_link_hash = Some(doc_hash.to_string());

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
        let mut stmt = tx.prepare(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path, target_anchor, alias, is_embed, is_wiki, is_external) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        ).with_context(|| format!("Failed to prepare link insert for doc {}", doc_id))?;
        for link in links {
            stmt.execute(params![
                doc_id,
                link.target_doc_id,
                link.target_path.as_str(),
                link.target_anchor.as_deref(),
                link.alias.as_deref(),
                bool_to_int(link.is_embed),
                bool_to_int(link.is_wiki),
                bool_to_int(link.is_external),
            ])
            .with_context(|| format!("Failed to insert link for doc {}", doc_id))?;
            summary.links_written += 1;
        }
    }

    tx.commit()
        .with_context(|| format!("Failed to commit links for doc {}", doc_id))?;

    Ok(())
}

fn bool_to_int(value: bool) -> i32 {
    if value {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests;

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
    tx.execute("DELETE FROM segment WHERE doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear segments for doc {}", doc_id))?;

    for prepared in &prepared_segments {
        let segment_id = insert_segment(&tx, doc_id, prepared.ordinal, &prepared.hash)?;
        summary.segments_created += 1;
        upsert_embedding(
            &tx,
            segment_id,
            embedder.model_name(),
            prepared.vector.dim,
            &prepared.vector.bytes,
            summary,
        )?;
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
    target_dim: i32,
    summary: &mut IndexSummary,
) -> Result<()> {
    let existing = load_segments_for_doc(conn, doc_id)?;

    for (ordinal, chunk) in chunks.iter().enumerate() {
        let hash = hash_content(chunk);
        let ordinal_key = ordinal as i64;
        if let Some(segment) = existing.get(&ordinal_key) {
            let hash_changed = segment.last_hash != hash;
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
                let cleanup_result =
                    conn.execute("DELETE FROM segment WHERE id = ?1", params![segment_id]);
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
