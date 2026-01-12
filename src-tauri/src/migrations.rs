use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    str,
};

use anyhow::{anyhow, Context, Result};
use include_dir::{include_dir, Dir};
use rusqlite::Connection;
use serde::Deserialize;

#[tauri::command]
pub fn apply_workspace_migrations_command(workspace_path: String) -> Result<(), String> {
    let workspace_path = PathBuf::from(workspace_path);
    apply_workspace_migrations(&workspace_path)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

static MIGRATIONS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/db/migrations");

const WORKSPACE_STATE_DIR: &str = ".mdit";
const DB_FILE_NAME: &str = "db.sqlite";
const MIGRATIONS_TABLE: &str = "__drizzle_migrations";

#[derive(Debug, Deserialize)]
struct Journal {
    entries: Vec<JournalEntry>,
}

#[derive(Debug, Deserialize)]
struct JournalEntry {
    idx: u32,
    tag: String,
}

struct MigrationFile {
    tag: String,
    idx: u32,
    sql: String,
}

pub fn apply_workspace_migrations(workspace_root: &Path) -> Result<PathBuf> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    let db_dir = workspace_root.join(WORKSPACE_STATE_DIR);
    fs::create_dir_all(&db_dir).with_context(|| {
        format!(
            "Failed to create workspace metadata directory at {}",
            db_dir.display()
        )
    })?;

    let db_path = db_dir.join(DB_FILE_NAME);
    let mut conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", &1)
        .context("Failed to enable foreign keys for workspace database")?;

    ensure_migrations_table(&conn)?;
    let applied = load_applied_migrations(&conn)?;
    let mut migrations = load_available_migrations()?;
    migrations.sort_by_key(|migration| migration.idx);

    for migration in migrations {
        if applied.contains(&migration.tag) {
            continue;
        }

        apply_single_migration(&mut conn, &migration)?;
    }

    Ok(db_path)
}

fn ensure_migrations_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(&format!(
        "
        CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        "
    ))
    .context("Failed to ensure migrations tracking table exists")?;

    Ok(())
}

fn load_applied_migrations(conn: &Connection) -> Result<HashSet<String>> {
    let mut stmt = conn
        .prepare(&format!("SELECT id FROM {MIGRATIONS_TABLE}"))
        .context("Failed to prepare statement to read applied migrations")?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .context("Failed to read applied migrations")?;

    let mut applied = HashSet::new();
    for row in rows {
        applied.insert(row?);
    }

    Ok(applied)
}

fn load_available_migrations() -> Result<Vec<MigrationFile>> {
    let journal_file = MIGRATIONS_DIR
        .get_file("meta/_journal.json")
        .ok_or_else(|| anyhow!("Failed to read migration journal metadata"))?;

    let journal: Journal = serde_json::from_slice(journal_file.contents())
        .context("Failed to parse migration journal metadata")?;

    let mut migrations = Vec::with_capacity(journal.entries.len());

    for entry in journal.entries {
        let filename = format!("{}.sql", entry.tag);
        let file = MIGRATIONS_DIR
            .get_file(&filename)
            .ok_or_else(|| anyhow!("Missing SQL file for migration {}", entry.tag))?;

        let sql = str::from_utf8(file.contents())
            .with_context(|| format!("Migration file {} contains invalid UTF-8", filename))?
            .to_string();

        migrations.push(MigrationFile {
            tag: entry.tag,
            idx: entry.idx,
            sql,
        });
    }

    Ok(migrations)
}

fn apply_single_migration(conn: &mut Connection, migration: &MigrationFile) -> Result<()> {
    let statements = split_statements(&migration.sql);
    if statements.is_empty() {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .with_context(|| format!("Failed to open transaction for {}", migration.tag))?;

    for statement in statements {
        tx.execute_batch(&statement).with_context(|| {
            format!(
                "Failed to execute statement for migration {}: {}",
                migration.tag, statement
            )
        })?;
    }

    tx.execute(
        &format!("INSERT INTO {MIGRATIONS_TABLE} (id) VALUES (?1)"),
        [&migration.tag],
    )
    .with_context(|| format!("Failed to mark migration {} as applied", migration.tag))?;

    tx.commit()
        .with_context(|| format!("Failed to commit migration {}", migration.tag))?;

    Ok(())
}

fn split_statements(sql: &str) -> Vec<String> {
    sql.split("--> statement-breakpoint")
        .map(str::trim)
        .filter(|chunk| !chunk.is_empty())
        .map(|chunk| chunk.to_string())
        .collect()
}
