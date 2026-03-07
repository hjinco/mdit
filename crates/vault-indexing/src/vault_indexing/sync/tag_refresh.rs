use anyhow::{Context, Result};
use rusqlite::{params, Connection};

use crate::vault_indexing::tags::NoteTag;

pub(super) fn replace_tags_for_doc(
    conn: &mut Connection,
    doc_id: i64,
    tags: &[NoteTag],
) -> Result<()> {
    let tx = conn
        .transaction()
        .with_context(|| format!("Failed to start tag transaction for doc {}", doc_id))?;

    tx.execute("DELETE FROM doc_tag WHERE doc_id = ?1", params![doc_id])
        .with_context(|| format!("Failed to clear tags for doc {}", doc_id))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO doc_tag (doc_id, tag, normalized_tag) \
                 VALUES (?1, ?2, ?3)",
            )
            .with_context(|| format!("Failed to prepare tag insert for doc {}", doc_id))?;

        for tag in tags {
            stmt.execute(params![
                doc_id,
                tag.tag.as_str(),
                tag.normalized_tag.as_str()
            ])
            .with_context(|| {
                format!(
                    "Failed to insert tag '{}' for doc {}",
                    tag.normalized_tag, doc_id
                )
            })?;
        }
    }

    tx.commit()
        .with_context(|| format!("Failed to commit tags for doc {}", doc_id))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::replace_tags_for_doc;
    use crate::vault_indexing::tags::NoteTag;

    fn open_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("failed to open in-memory db");
        conn.pragma_update(None, "foreign_keys", 1)
            .expect("failed to enable foreign keys");
        conn.execute_batch(
            "CREATE TABLE doc (
                 id INTEGER PRIMARY KEY
             );
             CREATE TABLE doc_tag (
                 doc_id INTEGER NOT NULL,
                 tag TEXT NOT NULL,
                 normalized_tag TEXT NOT NULL,
                 FOREIGN KEY (doc_id) REFERENCES doc(id) ON DELETE CASCADE
             );",
        )
        .expect("failed to create tag tables");
        conn
    }

    #[test]
    fn replace_tags_for_doc_rewrites_existing_rows() {
        let mut conn = open_connection();
        conn.execute("INSERT INTO doc (id) VALUES (?1)", params![1])
            .expect("failed to insert doc");
        conn.execute(
            "INSERT INTO doc_tag (doc_id, tag, normalized_tag) VALUES (?1, ?2, ?3)",
            params![1, "Old", "old"],
        )
        .expect("failed to insert old tag");

        replace_tags_for_doc(
            &mut conn,
            1,
            &[NoteTag {
                tag: "Project".to_string(),
                normalized_tag: "project".to_string(),
            }],
        )
        .expect("tag refresh should succeed");

        let rows = conn
            .prepare("SELECT tag, normalized_tag FROM doc_tag WHERE doc_id = ?1")
            .expect("failed to prepare query")
            .query_map(params![1], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .expect("failed to query rows")
            .map(|row| row.expect("failed to decode row"))
            .collect::<Vec<_>>();

        assert_eq!(rows, vec![("Project".to_string(), "project".to_string())]);
    }
}
