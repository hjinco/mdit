use std::{collections::HashSet, path::Path};

use anyhow::{Context, Result};
use rusqlite::{params, Connection};

use super::super::{links::LinkResolution, IndexSummary};

pub(super) fn bind_unresolved_links_for_inserted_docs(
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

pub(super) fn collect_query_keys_for_paths(paths: &[String]) -> HashSet<String> {
    let mut keys = HashSet::new();
    for rel_path in paths {
        for key in rel_path_query_keys(rel_path) {
            keys.insert(key);
        }
    }
    keys
}

pub(super) fn rel_path_query_keys(rel_path: &str) -> HashSet<String> {
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

pub(super) fn load_forced_link_refresh_doc_ids(
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

pub(super) fn replace_links_for_doc(
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

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use rusqlite::{params, Connection};

    use super::{
        bind_unresolved_links_for_inserted_docs, collect_query_keys_for_paths,
        load_forced_link_refresh_doc_ids, rel_path_query_keys, replace_links_for_doc,
    };
    use crate::indexing::{
        links::{LinkResolution, ResolvedLink},
        IndexSummary,
    };

    fn open_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("failed to open in-memory db");
        conn.pragma_update(None, "foreign_keys", 1)
            .expect("failed to enable foreign keys");
        conn.execute_batch(
            "CREATE TABLE doc (
                 id INTEGER PRIMARY KEY,
                 vault_id INTEGER NOT NULL,
                 rel_path TEXT NOT NULL
             );
             CREATE TABLE link (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 source_doc_id INTEGER NOT NULL,
                 target_doc_id INTEGER,
                 target_path TEXT NOT NULL
             );
             CREATE TABLE wiki_link_ref (
                 source_doc_id INTEGER NOT NULL,
                 query_key TEXT NOT NULL
             );",
        )
        .expect("failed to create test tables");
        conn
    }

    fn string_set(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn rel_path_query_keys_returns_normalized_suffixes() {
        let keys = rel_path_query_keys("Docs\\Team/Note.MDX ");

        assert_eq!(keys, string_set(&["note", "team/note", "docs/team/note"]));
    }

    #[test]
    fn collect_query_keys_for_paths_deduplicates_shared_keys() {
        let keys = collect_query_keys_for_paths(&[
            "docs/team/note.md".to_string(),
            "archive/team/note.md".to_string(),
        ]);

        assert_eq!(
            keys,
            string_set(&["note", "team/note", "docs/team/note", "archive/team/note"])
        );
    }

    #[test]
    fn load_forced_link_refresh_doc_ids_filters_by_vault_and_query_keys() {
        let conn = open_connection();
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![1, 10, "source-a.md"],
        )
        .expect("failed to insert doc 1");
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![2, 10, "source-b.md"],
        )
        .expect("failed to insert doc 2");
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![3, 99, "other-vault.md"],
        )
        .expect("failed to insert doc 3");

        conn.execute(
            "INSERT INTO wiki_link_ref (source_doc_id, query_key) VALUES (?1, ?2)",
            params![1, "note"],
        )
        .expect("failed to insert wiki ref for doc 1");
        conn.execute(
            "INSERT INTO wiki_link_ref (source_doc_id, query_key) VALUES (?1, ?2)",
            params![2, "team/note"],
        )
        .expect("failed to insert wiki ref for doc 2");
        conn.execute(
            "INSERT INTO wiki_link_ref (source_doc_id, query_key) VALUES (?1, ?2)",
            params![3, "note"],
        )
        .expect("failed to insert wiki ref for doc 3");

        let result = load_forced_link_refresh_doc_ids(
            &conn,
            10,
            &string_set(&["note", "team/note", "missing"]),
        )
        .expect("failed to load forced refresh ids");

        assert_eq!(result, HashSet::from([1, 2]));
    }

    #[test]
    fn bind_unresolved_links_updates_only_matching_unresolved_rows() {
        let conn = open_connection();
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![1, 10, "source.md"],
        )
        .expect("failed to insert source doc");
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![2, 10, "note.md"],
        )
        .expect("failed to insert target doc");

        conn.execute(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path) VALUES (?1, ?2, ?3)",
            params![1, Option::<i64>::None, "note.md"],
        )
        .expect("failed to insert unresolved matching link");
        conn.execute(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path) VALUES (?1, ?2, ?3)",
            params![1, Option::<i64>::None, "other.md"],
        )
        .expect("failed to insert unresolved non-matching link");
        conn.execute(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path) VALUES (?1, ?2, ?3)",
            params![1, Some(999_i64), "note.md"],
        )
        .expect("failed to insert already-bound link");

        bind_unresolved_links_for_inserted_docs(&conn, &[("note.md".to_string(), 2)])
            .expect("failed to bind unresolved links");

        let mut stmt = conn
            .prepare("SELECT target_path, target_doc_id FROM link ORDER BY id")
            .expect("failed to prepare link query");
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .expect("failed to query links");

        let values = rows
            .map(|row| row.expect("failed to decode link row"))
            .collect::<Vec<_>>();

        assert_eq!(
            values,
            vec![
                ("note.md".to_string(), Some(2)),
                ("other.md".to_string(), None),
                ("note.md".to_string(), Some(999)),
            ]
        );
    }

    #[test]
    fn replace_links_for_doc_replaces_existing_links_and_wiki_refs() {
        let mut conn = open_connection();
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![1, 10, "source.md"],
        )
        .expect("failed to insert source doc");
        conn.execute(
            "INSERT INTO doc (id, vault_id, rel_path) VALUES (?1, ?2, ?3)",
            params![2, 10, "target.md"],
        )
        .expect("failed to insert target doc");

        conn.execute(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path) VALUES (?1, ?2, ?3)",
            params![1, Some(2_i64), "old-target.md"],
        )
        .expect("failed to insert old link");
        conn.execute(
            "INSERT INTO link (source_doc_id, target_doc_id, target_path) VALUES (?1, ?2, ?3)",
            params![1, Option::<i64>::None, "old-unresolved.md"],
        )
        .expect("failed to insert old unresolved link");
        conn.execute(
            "INSERT INTO wiki_link_ref (source_doc_id, query_key) VALUES (?1, ?2)",
            params![1, "old"],
        )
        .expect("failed to insert old query key");

        let resolution = LinkResolution {
            links: vec![
                ResolvedLink {
                    target_doc_id: Some(2),
                    target_path: "target.md".to_string(),
                },
                ResolvedLink {
                    target_doc_id: None,
                    target_path: "missing.md".to_string(),
                },
            ],
            wiki_query_keys: string_set(&["target", "missing"]),
        };

        let mut summary = IndexSummary::default();
        replace_links_for_doc(&mut conn, 1, &resolution, &mut summary)
            .expect("failed to replace links");

        let mut link_stmt = conn
            .prepare(
                "SELECT target_path, target_doc_id \
                 FROM link WHERE source_doc_id = ?1 ORDER BY target_path",
            )
            .expect("failed to prepare refreshed link query");
        let link_rows = link_stmt
            .query_map(params![1], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .expect("failed to query refreshed links")
            .map(|row| row.expect("failed to decode refreshed link row"))
            .collect::<Vec<_>>();

        let mut wiki_stmt = conn
            .prepare(
                "SELECT query_key FROM wiki_link_ref \
                 WHERE source_doc_id = ?1 ORDER BY query_key",
            )
            .expect("failed to prepare refreshed wiki ref query");
        let wiki_rows = wiki_stmt
            .query_map(params![1], |row| row.get::<_, String>(0))
            .expect("failed to query refreshed wiki refs")
            .map(|row| row.expect("failed to decode refreshed wiki ref row"))
            .collect::<Vec<_>>();

        assert_eq!(
            link_rows,
            vec![
                ("missing.md".to_string(), None),
                ("target.md".to_string(), Some(2))
            ]
        );
        assert_eq!(wiki_rows, vec!["missing".to_string(), "target".to_string()]);
        assert_eq!(summary.links_deleted, 2);
        assert_eq!(summary.links_written, 2);
    }
}
