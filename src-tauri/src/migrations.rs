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
pub fn apply_appdata_migrations(
    app_handle: AppHandle,
    workspace_path: Option<String>,
) -> Result<(), String> {
    run_app_migrations(&app_handle).map_err(|error| error.to_string())?;

    if let Some(workspace_path) = workspace_path {
        let trimmed = workspace_path.trim();
        if !trimmed.is_empty() {
            if let Err(error) = cleanup_legacy_workspace_index_db(Path::new(trimmed)) {
                eprintln!(
                    "Failed to clean up legacy workspace DB at {}: {}",
                    trimmed, error
                );
            }
        }
    }

    Ok(())
}

static MIGRATIONS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

const DB_FILE_NAME: &str = "appdata.db";
const MIGRATIONS_TABLE: &str = "__migrations";
const WORKSPACE_STATE_DIR_NAME: &str = ".mdit";
const LEGACY_WORKSPACE_DB_FILE_NAME: &str = "db.sqlite";

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

fn cleanup_legacy_workspace_index_db(workspace_root: &Path) -> Result<()> {
    let legacy_db_path = workspace_root
        .join(WORKSPACE_STATE_DIR_NAME)
        .join(LEGACY_WORKSPACE_DB_FILE_NAME);

    if !legacy_db_path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(&legacy_db_path).with_context(|| {
        format!(
            "Failed to read metadata for legacy workspace DB at {}",
            legacy_db_path.display()
        )
    })?;

    if !metadata.is_file() {
        return Ok(());
    }

    fs::remove_file(&legacy_db_path).with_context(|| {
        format!(
            "Failed to remove legacy workspace DB at {}",
            legacy_db_path.display()
        )
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::cleanup_legacy_workspace_index_db;
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    struct TempWorkspace {
        root: PathBuf,
    }

    impl TempWorkspace {
        fn new(prefix: &str) -> Self {
            let mut root = std::env::temp_dir();
            root.push(format!("{prefix}-{}", unique_id()));
            fs::create_dir_all(&root).expect("failed to create temp workspace");
            Self { root }
        }

        fn root(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn given_legacy_db_file_when_cleanup_runs_then_db_file_is_removed() {
        let workspace = TempWorkspace::new("mdit-migrations-cleanup-remove");
        let state_dir = workspace.root().join(".mdit");
        fs::create_dir_all(&state_dir).expect("failed to create .mdit directory");

        let legacy_db_path = state_dir.join("db.sqlite");
        fs::write(&legacy_db_path, b"legacy").expect("failed to write legacy db");

        cleanup_legacy_workspace_index_db(workspace.root())
            .expect("cleanup should remove legacy db");

        assert!(!legacy_db_path.exists());
    }

    #[test]
    fn given_missing_legacy_db_when_cleanup_runs_then_it_succeeds() {
        let workspace = TempWorkspace::new("mdit-migrations-cleanup-missing");
        let state_dir = workspace.root().join(".mdit");
        fs::create_dir_all(&state_dir).expect("failed to create .mdit directory");

        cleanup_legacy_workspace_index_db(workspace.root())
            .expect("cleanup should succeed when db is absent");
    }

    #[test]
    fn given_workspace_settings_file_when_cleanup_runs_then_settings_file_is_preserved() {
        let workspace = TempWorkspace::new("mdit-migrations-cleanup-preserve");
        let state_dir = workspace.root().join(".mdit");
        fs::create_dir_all(&state_dir).expect("failed to create .mdit directory");

        let legacy_db_path = state_dir.join("db.sqlite");
        let workspace_settings_path = state_dir.join("workspace.json");
        fs::write(&legacy_db_path, b"legacy").expect("failed to write legacy db");
        fs::write(&workspace_settings_path, b"{}").expect("failed to write settings file");

        cleanup_legacy_workspace_index_db(workspace.root())
            .expect("cleanup should remove only legacy db");

        assert!(!legacy_db_path.exists());
        assert!(workspace_settings_path.exists());
    }

    fn unique_id() -> u128 {
        use std::time::{SystemTime, UNIX_EPOCH};

        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos()
    }
}
