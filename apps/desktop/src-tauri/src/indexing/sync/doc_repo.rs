use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, Row};

use super::super::{files::MarkdownFile, IndexSummary, TARGET_CHUNKING_VERSION};

#[derive(Debug, Clone)]
pub(super) struct DocRecord {
    pub(super) id: i64,
    pub(super) chunking_version: i64,
    pub(super) last_hash: Option<String>,
    pub(super) last_source_size: Option<i64>,
    pub(super) last_source_mtime_ns: Option<i64>,
    pub(super) last_embedding_model: Option<String>,
    pub(super) last_embedding_dim: Option<i32>,
}

impl DocRecord {
    pub(super) fn from_db_row(row: &Row<'_>) -> rusqlite::Result<(String, Self)> {
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

    pub(super) fn is_up_to_date(&self, doc_hash: &str, model: &str, target_dim: i32) -> bool {
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

    pub(super) fn links_up_to_date(&self, doc_hash: &str) -> bool {
        self.last_hash
            .as_deref()
            .map(|hash| hash == doc_hash)
            .unwrap_or(false)
    }

    pub(super) fn source_stat_matches(&self, file: &MarkdownFile) -> bool {
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
    FullMetadataWithoutContent {
        doc_hash: &'a str,
        file: &'a MarkdownFile,
        model: &'a str,
        target_dim: i32,
    },
}

pub(super) fn load_docs(conn: &Connection, vault_id: i64) -> Result<HashMap<String, DocRecord>> {
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

pub(super) fn remove_deleted_docs(
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
            conn.execute("DELETE FROM doc WHERE id = ?1", params![doc.id])
                .with_context(|| format!("Failed to delete doc for rel_path {}", rel_path))?;
            summary.docs_deleted += 1;
        }
    }

    Ok(to_delete)
}

pub(super) fn ensure_docs_for_files(
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

pub(super) fn update_source_stat(
    conn: &Connection,
    doc_record: &mut DocRecord,
    file: &MarkdownFile,
) -> Result<()> {
    apply_doc_update(conn, doc_record, DocUpdate::SourceStat { file })
}

pub(super) fn update_hash_and_content(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    indexed_content: &str,
    file: &MarkdownFile,
) -> Result<()> {
    apply_doc_update(
        conn,
        doc_record,
        DocUpdate::HashAndContent {
            doc_hash,
            indexed_content,
            file,
        },
    )
}

pub(super) fn update_full_metadata(
    conn: &Connection,
    doc_record: &mut DocRecord,
    doc_hash: &str,
    indexed_content: &str,
    file: &MarkdownFile,
    model: &str,
    target_dim: i32,
    refresh_indexed_content: bool,
) -> Result<()> {
    if refresh_indexed_content {
        apply_doc_update(
            conn,
            doc_record,
            DocUpdate::FullMetadata {
                doc_hash,
                indexed_content,
                file,
                model,
                target_dim,
            },
        )
    } else {
        apply_doc_update(
            conn,
            doc_record,
            DocUpdate::FullMetadataWithoutContent {
                doc_hash,
                file,
                model,
                target_dim,
            },
        )
    }
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
        DocUpdate::FullMetadataWithoutContent {
            doc_hash,
            file,
            model,
            target_dim,
        } => {
            conn.execute(
                "UPDATE doc \
                 SET chunking_version = ?1, last_hash = ?2, last_source_size = ?3, last_source_mtime_ns = ?4, \
                     last_embedding_model = ?5, last_embedding_dim = ?6 \
                 WHERE id = ?7",
                params![
                    TARGET_CHUNKING_VERSION,
                    doc_hash,
                    file.last_source_size,
                    file.last_source_mtime_ns,
                    model,
                    target_dim,
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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use rusqlite::{params, Connection};

    use super::{update_full_metadata, DocRecord};
    use crate::indexing::files::MarkdownFile;

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

    fn make_file(size: i64, mtime_ns: i64) -> MarkdownFile {
        MarkdownFile {
            abs_path: PathBuf::from("/tmp/test.md"),
            rel_path: "test.md".to_string(),
            last_source_size: Some(size),
            last_source_mtime_ns: Some(mtime_ns),
        }
    }

    fn open_doc_update_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("failed to open in-memory db");
        conn.execute_batch(
            "CREATE TABLE doc (
                 id INTEGER PRIMARY KEY,
                 chunking_version INTEGER NOT NULL,
                 last_hash TEXT,
                 last_source_size INTEGER,
                 last_source_mtime_ns INTEGER,
                 last_embedding_model TEXT,
                 last_embedding_dim INTEGER,
                 content TEXT NOT NULL
             );
             CREATE TABLE content_update_audit (
                 id INTEGER PRIMARY KEY AUTOINCREMENT
             );
             CREATE TRIGGER doc_content_au AFTER UPDATE OF content ON doc BEGIN
                 INSERT INTO content_update_audit (id) VALUES (NULL);
             END;",
        )
        .expect("failed to create doc update test schema");
        conn
    }

    #[test]
    fn full_metadata_without_content_does_not_trigger_content_update() {
        let conn = open_doc_update_connection();
        conn.execute(
            "INSERT INTO doc (
                id, chunking_version, last_hash, last_source_size, last_source_mtime_ns, last_embedding_model, last_embedding_dim, content
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![1, 1, "hash", 10, 20, "nomic-embed-text", 768, "original content"],
        )
        .expect("failed to insert doc");

        let mut doc = make_doc(Some("nomic-embed-text"), Some(768));
        let file = make_file(10, 20);

        update_full_metadata(
            &conn,
            &mut doc,
            "hash",
            "changed content",
            &file,
            "nomic-embed-text",
            768,
            false,
        )
        .expect("failed to update metadata without content");

        let audit_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_update_audit", [], |row| {
                row.get(0)
            })
            .expect("failed to query audit count");
        let content: String = conn
            .query_row("SELECT content FROM doc WHERE id = 1", [], |row| row.get(0))
            .expect("failed to read content");

        assert_eq!(audit_count, 0);
        assert_eq!(content, "original content");
    }

    #[test]
    fn full_metadata_with_content_triggers_content_update() {
        let conn = open_doc_update_connection();
        conn.execute(
            "INSERT INTO doc (
                id, chunking_version, last_hash, last_source_size, last_source_mtime_ns, last_embedding_model, last_embedding_dim, content
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![1, 1, "hash", 10, 20, "nomic-embed-text", 768, "original content"],
        )
        .expect("failed to insert doc");

        let mut doc = make_doc(Some("nomic-embed-text"), Some(768));
        let file = make_file(10, 20);

        update_full_metadata(
            &conn,
            &mut doc,
            "next-hash",
            "changed content",
            &file,
            "nomic-embed-text",
            768,
            true,
        )
        .expect("failed to update metadata with content");

        let audit_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_update_audit", [], |row| {
                row.get(0)
            })
            .expect("failed to query audit count");
        let content: String = conn
            .query_row("SELECT content FROM doc WHERE id = 1", [], |row| row.get(0))
            .expect("failed to read content");

        assert_eq!(audit_count, 1);
        assert_eq!(content, "changed content");
    }
}
