use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) struct Harness {
    root: PathBuf,
    pub(crate) db_path: PathBuf,
    pub(crate) workspace_path: PathBuf,
    pub(crate) vault_id: i64,
}

impl Harness {
    pub(crate) fn new(prefix: &str) -> Self {
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
            .expect("failed to resolve workspace")
            .expect("workspace row should exist");

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

fn unique_id() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock error")
        .as_nanos()
}
