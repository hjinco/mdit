use std::collections::HashMap;

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection};

use super::super::{
    chunking::hash_content,
    embedding::{EmbeddingClient, EmbeddingVector},
    IndexSummary,
};

const SEGMENT_VEC_TABLE: &str = "segment_vec";

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

pub(super) fn rebuild_doc_chunks(
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

pub(super) fn sync_segments_for_doc(
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

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::upsert_embedding;
    use crate::indexing::IndexSummary;

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
