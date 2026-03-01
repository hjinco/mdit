use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(super) struct Harness {
    pub(super) root: PathBuf,
    pub(super) db_path: PathBuf,
    pub(super) workspace_path: PathBuf,
    pub(super) vault_id: i64,
}

impl Harness {
    pub(super) fn new(prefix: &str) -> Self {
        let mut root = std::env::temp_dir();
        root.push(format!("{prefix}-{}", unique_id()));
        fs::create_dir_all(&root).expect("failed to create temp root");

        let db_path = root.join("appdata.sqlite");
        app_storage::migrations::run_migrations_at(&db_path).expect("failed to run migrations");

        let workspace_path = root.join("workspace");
        fs::create_dir_all(&workspace_path).expect("failed to create workspace");
        app_storage::vault::touch_workspace(&db_path, &workspace_path)
            .expect("failed to touch workspace");

        let vault = app_storage::vault::find_workspace_by_path(&db_path, &workspace_path)
            .expect("failed to load workspace")
            .expect("workspace should exist");

        Self {
            root,
            db_path,
            workspace_path,
            vault_id: vault.id,
        }
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

pub(super) fn seed_search_fixture(harness: &Harness) {
    fs::write(
        harness.workspace_path.join("Nebula One.md"),
        build_search_content("nebula"),
    )
    .expect("failed to write Nebula One.md");
    fs::write(
        harness.workspace_path.join("Nebula Two.md"),
        build_search_content("nebula"),
    )
    .expect("failed to write Nebula Two.md");

    mdit_indexing::index_workspace(
        Path::new(&harness.workspace_path),
        Path::new(&harness.db_path),
        "",
        "",
        false,
    )
    .expect("failed to index workspace");
}

fn build_search_content(query: &str) -> String {
    format!(
        "# Search Fixture\n\n{query}\n\n{}\n",
        "lorem ipsum ".repeat(40)
    )
}

fn unique_id() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock error")
        .as_nanos()
}
