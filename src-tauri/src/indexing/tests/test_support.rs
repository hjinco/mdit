use std::path::{Path, PathBuf};

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

use crate::migrations;

use super::super::{
    find_vault_id, get_backlinks, get_indexing_meta, index_note, index_workspace, BacklinkEntry,
    IndexSummary, IndexingMeta,
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

        let db_path = root.join("indexing-test.sqlite");
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

    pub(super) fn set_doc_source_stat(
        &self,
        rel_path: &str,
        size: Option<i64>,
        mtime_ns: Option<i64>,
    ) {
        self.doc_mutations()
            .set_source_stat(rel_path, size, mtime_ns);
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
}

fn unique_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}
