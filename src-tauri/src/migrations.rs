use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    str,
};

use anyhow::{anyhow, Context, Result};
use include_dir::{include_dir, Dir};
use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

use crate::sqlite_vec_ext;

#[tauri::command]
pub fn apply_appdata_migrations(app_handle: AppHandle) -> Result<(), String> {
    run_app_migrations(&app_handle)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

static MIGRATIONS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

const DB_FILE_NAME: &str = "appdata.db";
const MIGRATIONS_TABLE: &str = "__migrations";

struct MigrationFile {
    tag: String,
    sql: String,
}

pub fn resolve_appdata_db_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .with_context(|| "Failed to resolve app data directory for appdata database")?;

    Ok(app_data_dir.join(DB_FILE_NAME))
}

pub fn run_app_migrations<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf> {
    let db_path = resolve_appdata_db_path(app_handle)?;
    run_migrations_at(&db_path)?;
    Ok(db_path)
}

pub fn run_migrations_at(db_path: &Path) -> Result<()> {
    sqlite_vec_ext::register_auto_extension()?;

    let db_dir = db_path.parent().ok_or_else(|| {
        anyhow!(
            "Failed to resolve database directory from path {}",
            db_path.display()
        )
    })?;

    fs::create_dir_all(db_dir).with_context(|| {
        format!(
            "Failed to create appdata metadata directory at {}",
            db_dir.display()
        )
    })?;

    let mut conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open appdata database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", 1)
        .context("Failed to enable foreign keys for appdata database")?;

    ensure_migrations_table(&conn)?;
    let applied = load_applied_migrations(&conn)?;
    let migrations = load_available_migrations()?;

    for migration in migrations {
        if applied.contains(&migration.tag) {
            continue;
        }

        apply_single_migration(&mut conn, &migration)?;
    }

    Ok(())
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
    let mut migrations = Vec::new();

    for file in MIGRATIONS_DIR.files() {
        let path = file.path();
        let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("sql") {
            continue;
        }

        let Some(tag) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };

        let sql = str::from_utf8(file.contents())
            .with_context(|| format!("Migration file {} contains invalid UTF-8", path.display()))?
            .to_string();

        migrations.push(MigrationFile {
            tag: tag.to_string(),
            sql,
        });
    }

    migrations.sort_by(|lhs, rhs| lhs.tag.cmp(&rhs.tag));

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
