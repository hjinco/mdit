use std::path::{Path, PathBuf};

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

use app_storage::migrations;

use super::super::{
    find_vault_id, get_backlinks, get_indexing_meta, index_note, index_workspace,
    search_notes_by_tag, BacklinkEntry, IndexSummary, IndexingMeta,
};

pub(super) struct IndexingHarness {
    root: PathBuf,
    db_path: PathBuf,
}

struct DocQueries<'a> {
    harness: &'a IndexingHarness,
}

struct DocMutations<'a> {
    harness: &'a IndexingHarness,
}

impl IndexingHarness {
    pub(super) fn new(prefix: &str) -> Self {
        let mut root = std::env::temp_dir();
        root.push(format!("{prefix}-{}", unique_id()));
        std::fs::create_dir_all(&root).expect("failed to create temp workspace");

        let db_path = root.join("vault-indexing-test.sqlite");
        migrations::run_migrations_at(&db_path).expect("failed to run test migrations");

        Self { root, db_path }
    }

    pub(super) fn root(&self) -> &Path {
        &self.root
    }

    pub(super) fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub(super) fn write_note(&self, rel_path: &str, contents: &str) {
        let path = self.root.join(rel_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("failed to create note parent directory");
        }
        std::fs::write(path, contents).expect("failed to write note");
    }

    pub(super) fn remove_note(&self, rel_path: &str) {
        let path = self.root.join(rel_path);
        std::fs::remove_file(path).expect("failed to remove note");
    }

    pub(super) fn run_workspace_index(&self) -> IndexSummary {
        index_workspace(&self.root, &self.db_path, "", "", false)
            .expect("workspace indexing should succeed")
    }

    pub(super) fn run_workspace_index_with_embeddings(
        &self,
        embedding_provider: &str,
        embedding_model: &str,
    ) -> IndexSummary {
        index_workspace(
            &self.root,
            &self.db_path,
            embedding_provider,
            embedding_model,
            false,
        )
        .expect("workspace indexing with embeddings should succeed")
    }

    pub(super) fn run_note_index(&self, rel_path: &str) -> Result<IndexSummary> {
        self.run_note_index_for_path(&self.root.join(rel_path))
    }

    pub(super) fn run_note_index_for_path(&self, note_path: &Path) -> Result<IndexSummary> {
        index_note(&self.root, &self.db_path, note_path, "", "")
    }

    pub(super) fn meta(&self) -> IndexingMeta {
        get_indexing_meta(&self.root, &self.db_path).expect("failed to read indexing metadata")
    }

    pub(super) fn backlinks(&self, rel_path: &str) -> Vec<BacklinkEntry> {
        get_backlinks(&self.root, &self.db_path, &self.root.join(rel_path))
            .expect("failed to query backlinks")
    }

    pub(super) fn search_tags(&self, tag_query: &str) -> Vec<String> {
        search_notes_by_tag(&self.root, &self.db_path, tag_query)
            .expect("failed to search tags")
            .into_iter()
            .map(|entry| entry.path)
            .collect()
    }

    pub(super) fn doc_tags(&self, rel_path: &str) -> Vec<(String, String)> {
        let Some((conn, vault_id)) = self.open_vault_connection() else {
            return Vec::new();
        };

        let mut stmt = conn
            .prepare(
                "SELECT dt.tag, dt.normalized_tag \
                 FROM doc_tag dt \
                 JOIN doc d ON d.id = dt.doc_id \
                 WHERE d.vault_id = ?1 AND d.rel_path = ?2 \
                 ORDER BY dt.normalized_tag",
            )
            .expect("failed to prepare tag query");

        let rows = stmt
            .query_map(params![vault_id, rel_path], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .expect("failed to query tag rows");

        rows.map(|row| row.expect("failed to decode tag row"))
            .collect()
    }

    pub(super) fn install_doc_tag_audit(&self) {
        let conn = self.open_connection();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS doc_tag_audit (
                 event TEXT NOT NULL,
                 doc_id INTEGER NOT NULL,
                 normalized_tag TEXT NOT NULL
             );
             CREATE TRIGGER IF NOT EXISTS doc_tag_audit_ai
             AFTER INSERT ON doc_tag BEGIN
                 INSERT INTO doc_tag_audit (event, doc_id, normalized_tag)
                 VALUES ('insert', new.doc_id, new.normalized_tag);
             END;
             CREATE TRIGGER IF NOT EXISTS doc_tag_audit_ad
             AFTER DELETE ON doc_tag BEGIN
                 INSERT INTO doc_tag_audit (event, doc_id, normalized_tag)
                 VALUES ('delete', old.doc_id, old.normalized_tag);
             END;",
        )
        .expect("failed to install doc_tag audit triggers");
    }

    pub(super) fn doc_tag_audit_events(&self) -> Vec<(String, String, String)> {
        let Some((conn, vault_id)) = self.open_vault_connection() else {
            return Vec::new();
        };

        let mut stmt = conn
            .prepare(
                "SELECT a.event, d.rel_path, a.normalized_tag
                 FROM doc_tag_audit a
                 JOIN doc d ON d.id = a.doc_id
                 WHERE d.vault_id = ?1
                 ORDER BY a.event, d.rel_path, a.normalized_tag",
            )
            .expect("failed to prepare doc_tag audit query");

        let rows = stmt
            .query_map(params![vault_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .expect("failed to query doc_tag audit rows");

        rows.map(|row| row.expect("failed to decode doc_tag audit row"))
            .collect()
    }
    pub(super) fn link_targets_for(&self, source_rel_path: &str) -> Vec<String> {
        let Some((conn, vault_id)) = self.open_vault_connection() else {
            return Vec::new();
        };

        let mut stmt = conn
            .prepare(
                "SELECT l.target_path \
                 FROM link l \
                 JOIN doc d ON d.id = l.source_doc_id \
                 WHERE d.vault_id = ?1 AND d.rel_path = ?2 \
                 ORDER BY l.target_path",
            )
            .expect("failed to prepare link target query");

        let rows = stmt
            .query_map(params![vault_id, source_rel_path], |row| {
                row.get::<_, String>(0)
            })
            .expect("failed to read link target rows");

        rows.map(|row| row.expect("failed to decode link target row"))
            .collect()
    }

    pub(super) fn link_rows_for(&self, source_rel_path: &str) -> Vec<(String, Option<i64>)> {
        let Some((conn, vault_id)) = self.open_vault_connection() else {
            return Vec::new();
        };

        let mut stmt = conn
            .prepare(
                "SELECT l.target_path, l.target_doc_id \
                 FROM link l \
                 JOIN doc d ON d.id = l.source_doc_id \
                 WHERE d.vault_id = ?1 AND d.rel_path = ?2 \
                 ORDER BY l.target_path",
            )
            .expect("failed to prepare link row query");

        let rows = stmt
            .query_map(params![vault_id, source_rel_path], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .expect("failed to read link rows");

        rows.map(|row| row.expect("failed to decode link row"))
            .collect()
    }

    pub(super) fn wiki_ref_keys_for(&self, source_rel_path: &str) -> Vec<String> {
        let Some((conn, vault_id)) = self.open_vault_connection() else {
            return Vec::new();
        };

        let mut stmt = conn
            .prepare(
                "SELECT wr.query_key \
                 FROM wiki_link_ref wr \
                 JOIN doc d ON d.id = wr.source_doc_id \
                 WHERE d.vault_id = ?1 AND d.rel_path = ?2 \
                 ORDER BY wr.query_key",
            )
            .expect("failed to prepare wiki ref query");

        let rows = stmt
            .query_map(params![vault_id, source_rel_path], |row| {
                row.get::<_, String>(0)
            })
            .expect("failed to read wiki ref rows");

        rows.map(|row| row.expect("failed to decode wiki ref row"))
            .collect()
    }

    pub(super) fn doc_id(&self, rel_path: &str) -> Option<i64> {
        let (conn, vault_id) = self.open_vault_connection()?;
        conn.query_row(
            "SELECT id FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .expect("failed to query doc id")
    }

    pub(super) fn doc_content(&self, rel_path: &str) -> Option<String> {
        self.doc_queries().content(rel_path)
    }

    pub(super) fn doc_hash(&self, rel_path: &str) -> Option<String> {
        self.doc_queries().hash(rel_path)
    }

    pub(super) fn clear_doc_hash(&self, rel_path: &str) {
        self.doc_mutations().clear_hash(rel_path);
    }

    pub(super) fn doc_source_stat(&self, rel_path: &str) -> Option<(Option<i64>, Option<i64>)> {
        self.doc_queries().source_stat(rel_path)
    }

    pub(super) fn doc_embedding_metadata(
        &self,
        rel_path: &str,
    ) -> Option<(Option<String>, Option<i32>)> {
        self.doc_queries().embedding_metadata(rel_path)
    }

    pub(super) fn set_doc_source_stat(
        &self,
        rel_path: &str,
        size: Option<i64>,
        mtime_ns: Option<i64>,
    ) {
        self.doc_mutations()
            .set_source_stat(rel_path, size, mtime_ns);
    }

    pub(super) fn set_doc_chunking_version(&self, rel_path: &str, chunking_version: i64) {
        self.doc_mutations()
            .set_chunking_version(rel_path, chunking_version);
    }

    pub(super) fn set_doc_embedding_metadata(
        &self,
        rel_path: &str,
        model: Option<&str>,
        dim: Option<i32>,
    ) {
        self.doc_mutations()
            .set_embedding_metadata(rel_path, model, dim);
    }
    fn doc_queries(&self) -> DocQueries<'_> {
        DocQueries { harness: self }
    }

    fn doc_mutations(&self) -> DocMutations<'_> {
        DocMutations { harness: self }
    }

    fn open_vault_connection(&self) -> Option<(Connection, i64)> {
        let conn = self.open_connection();
        let vault_id = find_vault_id(&conn, &self.root).expect("failed to find vault id")?;
        Some((conn, vault_id))
    }

    fn open_connection(&self) -> Connection {
        let conn = Connection::open(&self.db_path).expect("failed to open test sqlite db");
        conn.pragma_update(None, "foreign_keys", 1)
            .expect("failed to enable foreign keys");
        conn
    }
}

impl Drop for IndexingHarness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

impl DocQueries<'_> {
    fn content(&self, rel_path: &str) -> Option<String> {
        let (conn, vault_id) = self.harness.open_vault_connection()?;
        conn.query_row(
            "SELECT content FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .expect("failed to query doc content")
    }

    fn hash(&self, rel_path: &str) -> Option<String> {
        let (conn, vault_id) = self.harness.open_vault_connection()?;
        conn.query_row(
            "SELECT last_hash FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .expect("failed to query doc hash")
        .flatten()
    }

    fn source_stat(&self, rel_path: &str) -> Option<(Option<i64>, Option<i64>)> {
        let (conn, vault_id) = self.harness.open_vault_connection()?;
        conn.query_row(
            "SELECT last_source_size, last_source_mtime_ns \
             FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .optional()
        .expect("failed to query doc source stat")
    }

    fn embedding_metadata(&self, rel_path: &str) -> Option<(Option<String>, Option<i32>)> {
        let (conn, vault_id) = self.harness.open_vault_connection()?;
        conn.query_row(
            "SELECT last_embedding_model, last_embedding_dim \
             FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<i32>>(1)?,
                ))
            },
        )
        .optional()
        .expect("failed to query doc embedding metadata")
    }
}

impl DocMutations<'_> {
    fn clear_hash(&self, rel_path: &str) {
        let Some((conn, vault_id)) = self.harness.open_vault_connection() else {
            return;
        };
        conn.execute(
            "UPDATE doc SET last_hash = NULL WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
        )
        .expect("failed to clear doc hash");
    }

    fn set_source_stat(&self, rel_path: &str, size: Option<i64>, mtime_ns: Option<i64>) {
        let Some((conn, vault_id)) = self.harness.open_vault_connection() else {
            return;
        };
        conn.execute(
            "UPDATE doc \
             SET last_source_size = ?1, last_source_mtime_ns = ?2 \
             WHERE vault_id = ?3 AND rel_path = ?4",
            params![size, mtime_ns, vault_id, rel_path],
        )
        .expect("failed to update doc source stat");
    }

    fn set_chunking_version(&self, rel_path: &str, chunking_version: i64) {
        let Some((conn, vault_id)) = self.harness.open_vault_connection() else {
            return;
        };
        conn.execute(
            "UPDATE doc SET chunking_version = ?1 WHERE vault_id = ?2 AND rel_path = ?3",
            params![chunking_version, vault_id, rel_path],
        )
        .expect("failed to update doc chunking version");
    }

    fn set_embedding_metadata(&self, rel_path: &str, model: Option<&str>, dim: Option<i32>) {
        let Some((conn, vault_id)) = self.harness.open_vault_connection() else {
            return;
        };
        conn.execute(
            "UPDATE doc \
             SET last_embedding_model = ?1, last_embedding_dim = ?2 \
             WHERE vault_id = ?3 AND rel_path = ?4",
            params![model, dim, vault_id, rel_path],
        )
        .expect("failed to update doc embedding metadata");
    }
}

fn unique_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}
