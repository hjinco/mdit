use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEmbeddingConfig {
    pub embedding_provider: String,
    pub embedding_model: String,
}

fn open_vault_connection(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open appdata database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", 1)
        .context("Failed to enable foreign keys for appdata database")?;

    Ok(conn)
}

fn canonicalize_workspace_root(workspace_root: &Path) -> Result<PathBuf> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    fs::canonicalize(workspace_root).with_context(|| {
        format!(
            "Failed to canonicalize workspace path {}",
            workspace_root.display()
        )
    })
}

fn normalize_workspace_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalized_workspace_key(workspace_root: &Path) -> Result<String> {
    let canonical_root = canonicalize_workspace_root(workspace_root)?;
    Ok(normalize_workspace_path(&canonical_root))
}

fn normalized_workspace_key_from_input(workspace_path: &str) -> Option<String> {
    let trimmed = workspace_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.replace('\\', "/"))
}

pub fn find_workspace_id(conn: &Connection, workspace_root: &Path) -> Result<Option<i64>> {
    let workspace_key = normalized_workspace_key(workspace_root)?;

    conn.query_row(
        "SELECT id FROM vault WHERE workspace_root = ?1",
        params![workspace_key],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .context("Failed to resolve vault id")
}

pub fn ensure_workspace_exists(conn: &Connection, workspace_root: &Path) -> Result<i64> {
    let workspace_key = normalized_workspace_key(workspace_root)?;

    conn.execute(
        "INSERT OR IGNORE INTO vault (workspace_root) VALUES (?1)",
        params![workspace_key],
    )
    .context("Failed to ensure vault row exists")?;

    conn.query_row(
        "SELECT id FROM vault WHERE workspace_root = ?1",
        params![workspace_key],
        |row| row.get::<_, i64>(0),
    )
    .context("Failed to load vault id")
}

pub fn get_embedding_config(
    db_path: &Path,
    workspace_root: &Path,
) -> Result<Option<VaultEmbeddingConfig>> {
    let workspace_key = normalized_workspace_key(workspace_root)?;
    let conn = open_vault_connection(db_path)?;

    let row: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT embedding_provider, embedding_model FROM vault WHERE workspace_root = ?1",
            params![workspace_key],
            |db_row| Ok((db_row.get(0)?, db_row.get(1)?)),
        )
        .optional()
        .context("Failed to load vault embedding config")?;

    let Some((provider, model)) = row else {
        return Ok(None);
    };

    let normalized_model = model.unwrap_or_default().trim().to_string();
    if normalized_model.is_empty() {
        return Ok(None);
    }

    let normalized_provider = provider.unwrap_or_default().trim().to_string();
    let embedding_provider = if normalized_provider.is_empty() {
        "ollama".to_string()
    } else {
        normalized_provider
    };

    Ok(Some(VaultEmbeddingConfig {
        embedding_provider,
        embedding_model: normalized_model,
    }))
}

pub fn set_embedding_config(
    db_path: &Path,
    workspace_root: &Path,
    embedding_provider: &str,
    embedding_model: &str,
) -> Result<()> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_workspace_exists(&conn, workspace_root)?;
    let normalized_model = embedding_model.trim();

    if normalized_model.is_empty() {
        conn.execute(
            "UPDATE vault SET embedding_provider = NULL, embedding_model = NULL WHERE id = ?1",
            params![vault_id],
        )
        .context("Failed to clear vault embedding config")?;
        return Ok(());
    }

    let normalized_provider = embedding_provider.trim();
    let provider_to_store = if normalized_provider.is_empty() {
        "ollama"
    } else {
        normalized_provider
    };

    conn.execute(
        "UPDATE vault SET embedding_provider = ?1, embedding_model = ?2 WHERE id = ?3",
        params![provider_to_store, normalized_model, vault_id],
    )
    .context("Failed to save vault embedding config")?;

    Ok(())
}

pub fn touch_workspace(db_path: &Path, workspace_root: &Path) -> Result<()> {
    let workspace_key = normalized_workspace_key(workspace_root)?;
    let conn = open_vault_connection(db_path)?;

    conn.execute(
        "INSERT INTO vault (workspace_root, last_opened_at) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(workspace_root) DO UPDATE SET last_opened_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![workspace_key],
    )
    .context("Failed to touch vault row")?;

    Ok(())
}

pub fn list_workspaces(db_path: &Path) -> Result<Vec<String>> {
    let conn = open_vault_connection(db_path)?;
    let mut stmt = conn
        .prepare("SELECT workspace_root FROM vault ORDER BY last_opened_at DESC, id DESC")
        .context("Failed to prepare vault workspace list query")?;

    let workspaces = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .context("Failed to load vault workspaces")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read vault workspace rows")?;

    Ok(workspaces)
}

pub fn remove_workspace(db_path: &Path, workspace_path: &str) -> Result<()> {
    let mut candidates: HashSet<String> = HashSet::new();

    if let Some(raw_key) = normalized_workspace_key_from_input(workspace_path) {
        candidates.insert(raw_key);
    }

    let workspace_root = Path::new(workspace_path);
    if let Ok(canonical_key) = normalized_workspace_key(workspace_root) {
        candidates.insert(canonical_key);
    }

    if candidates.is_empty() {
        return Ok(());
    }

    let conn = open_vault_connection(db_path)?;
    for candidate in candidates {
        conn.execute(
            "DELETE FROM vault WHERE workspace_root = ?1",
            params![candidate],
        )
        .context("Failed to remove vault row")?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_workspace_exists, get_embedding_config, list_workspaces, remove_workspace,
        set_embedding_config, touch_workspace,
    };
    use crate::migrations;
    use rusqlite::{params, Connection, OptionalExtension};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    struct VaultHarness {
        root: PathBuf,
        db_path: PathBuf,
    }

    impl VaultHarness {
        fn new(prefix: &str) -> Self {
            let mut root = std::env::temp_dir();
            root.push(format!("{prefix}-{}", unique_id()));
            fs::create_dir_all(&root).expect("failed to create temp root");

            let db_path = root.join("vault-test.sqlite");
            migrations::run_migrations_at(&db_path).expect("failed to run test migrations");

            Self { root, db_path }
        }

        fn create_workspace(&self, name: &str) -> PathBuf {
            let path = self.root.join(name);
            fs::create_dir_all(&path).expect("failed to create workspace");
            path
        }

        fn workspace_key(path: &Path) -> String {
            fs::canonicalize(path)
                .expect("workspace should be canonicalizable")
                .to_string_lossy()
                .replace('\\', "/")
        }

        fn open_connection(&self) -> Connection {
            let conn = Connection::open(&self.db_path).expect("failed to open sqlite");
            conn.pragma_update(None, "foreign_keys", 1)
                .expect("failed to enable foreign keys");
            conn
        }
    }

    impl Drop for VaultHarness {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn given_touched_workspaces_when_listing_then_most_recent_is_first_and_rows_are_unique() {
        let harness = VaultHarness::new("mdit-vault-touch-order");
        let workspace_a = harness.create_workspace("a");
        let workspace_b = harness.create_workspace("b");
        let key_a = VaultHarness::workspace_key(&workspace_a);
        let key_b = VaultHarness::workspace_key(&workspace_b);

        touch_workspace(&harness.db_path, &workspace_a).expect("touch should succeed");
        std::thread::sleep(Duration::from_millis(5));
        touch_workspace(&harness.db_path, &workspace_b).expect("touch should succeed");
        std::thread::sleep(Duration::from_millis(5));
        touch_workspace(&harness.db_path, &workspace_a).expect("touch should succeed");

        let workspaces = list_workspaces(&harness.db_path).expect("listing should succeed");
        assert_eq!(workspaces, vec![key_a.clone(), key_b]);

        let conn = harness.open_connection();
        let row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM vault WHERE workspace_root = ?1",
                params![key_a],
                |row| row.get(0),
            )
            .expect("failed to count rows");
        assert_eq!(row_count, 1);
    }

    #[test]
    fn given_existing_workspace_when_ensuring_then_last_opened_at_is_not_updated() {
        let harness = VaultHarness::new("mdit-vault-ensure-no-touch");
        let workspace = harness.create_workspace("ws");
        let key = VaultHarness::workspace_key(&workspace);

        touch_workspace(&harness.db_path, &workspace).expect("touch should succeed");

        let conn = harness.open_connection();
        let before: String = conn
            .query_row(
                "SELECT last_opened_at FROM vault WHERE workspace_root = ?1",
                params![key.clone()],
                |row| row.get(0),
            )
            .expect("failed to load last_opened_at");
        std::thread::sleep(Duration::from_millis(5));
        ensure_workspace_exists(&conn, &workspace).expect("ensure should succeed");
        let after: String = conn
            .query_row(
                "SELECT last_opened_at FROM vault WHERE workspace_root = ?1",
                params![key],
                |row| row.get(0),
            )
            .expect("failed to load last_opened_at");

        assert_eq!(before, after);
    }

    #[test]
    fn given_removed_workspace_candidates_when_removing_then_rows_are_deleted() {
        let harness = VaultHarness::new("mdit-vault-remove");
        let workspace = harness.create_workspace("existing");
        let workspace_key = VaultHarness::workspace_key(&workspace);
        touch_workspace(&harness.db_path, &workspace).expect("touch should succeed");

        let raw_missing = format!("{}/missing", harness.root.to_string_lossy());
        let conn = harness.open_connection();
        conn.execute(
            "INSERT INTO vault (workspace_root) VALUES (?1)",
            params![raw_missing.clone()],
        )
        .expect("failed to insert raw missing row");

        remove_workspace(&harness.db_path, &raw_missing).expect("remove should succeed");
        remove_workspace(&harness.db_path, workspace.to_string_lossy().as_ref())
            .expect("remove should succeed");

        let conn = harness.open_connection();
        let removed_missing: Option<i64> = conn
            .query_row(
                "SELECT id FROM vault WHERE workspace_root = ?1",
                params![raw_missing],
                |row| row.get(0),
            )
            .optional()
            .expect("failed to query removed missing row");
        let removed_workspace: Option<i64> = conn
            .query_row(
                "SELECT id FROM vault WHERE workspace_root = ?1",
                params![workspace_key],
                |row| row.get(0),
            )
            .optional()
            .expect("failed to query removed workspace row");

        assert!(removed_missing.is_none());
        assert!(removed_workspace.is_none());
    }

    #[test]
    fn given_saved_embedding_config_when_loading_then_it_roundtrips() {
        let harness = VaultHarness::new("mdit-vault-embedding-roundtrip");
        let workspace = harness.create_workspace("ws");

        set_embedding_config(&harness.db_path, &workspace, "ollama", "mxbai-embed-large")
            .expect("set config should succeed");

        let config = get_embedding_config(&harness.db_path, &workspace)
            .expect("get config should succeed")
            .expect("config should exist");

        assert_eq!(config.embedding_provider, "ollama");
        assert_eq!(config.embedding_model, "mxbai-embed-large");
    }

    #[test]
    fn given_empty_model_when_saving_embedding_config_then_it_clears_columns() {
        let harness = VaultHarness::new("mdit-vault-embedding-clear");
        let workspace = harness.create_workspace("ws");

        set_embedding_config(&harness.db_path, &workspace, "ollama", "model-a")
            .expect("set config should succeed");
        set_embedding_config(&harness.db_path, &workspace, "openai", "")
            .expect("clear config should succeed");

        let config =
            get_embedding_config(&harness.db_path, &workspace).expect("get config should succeed");
        assert!(config.is_none());

        let conn = harness.open_connection();
        let key = VaultHarness::workspace_key(&workspace);
        let row: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT embedding_provider, embedding_model FROM vault WHERE workspace_root = ?1",
                params![key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("failed to read cleared columns");
        assert!(row.0.is_none());
        assert!(row.1.is_none());
    }

    #[test]
    fn given_missing_workspace_row_when_setting_embedding_then_row_is_created() {
        let harness = VaultHarness::new("mdit-vault-embedding-create-row");
        let workspace = harness.create_workspace("ws");

        set_embedding_config(&harness.db_path, &workspace, "", "model-a")
            .expect("set config should create vault row");

        let key = VaultHarness::workspace_key(&workspace);
        let conn = harness.open_connection();
        let row: (i64, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(embedding_provider), MAX(embedding_model) \
                 FROM vault WHERE workspace_root = ?1",
                params![key],
                |db_row| Ok((db_row.get(0)?, db_row.get(1)?, db_row.get(2)?)),
            )
            .expect("failed to inspect created row");

        assert_eq!(row.0, 1);
        assert_eq!(row.1.as_deref(), Some("ollama"));
        assert_eq!(row.2.as_deref(), Some("model-a"));
    }

    #[test]
    fn given_two_workspaces_when_saving_embedding_configs_then_values_are_isolated() {
        let harness = VaultHarness::new("mdit-vault-embedding-isolated");
        let workspace_a = harness.create_workspace("a");
        let workspace_b = harness.create_workspace("b");

        set_embedding_config(&harness.db_path, &workspace_a, "ollama", "model-a")
            .expect("set config for workspace a should succeed");
        set_embedding_config(
            &harness.db_path,
            &workspace_b,
            "openai",
            "text-embedding-3-small",
        )
        .expect("set config for workspace b should succeed");

        let config_a = get_embedding_config(&harness.db_path, &workspace_a)
            .expect("get config for workspace a should succeed")
            .expect("config for workspace a should exist");
        let config_b = get_embedding_config(&harness.db_path, &workspace_b)
            .expect("get config for workspace b should succeed")
            .expect("config for workspace b should exist");

        assert_eq!(config_a.embedding_provider, "ollama");
        assert_eq!(config_a.embedding_model, "model-a");
        assert_eq!(config_b.embedding_provider, "openai");
        assert_eq!(config_b.embedding_model, "text-embedding-3-small");
    }

    fn unique_id() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock error")
            .as_nanos()
    }
}
