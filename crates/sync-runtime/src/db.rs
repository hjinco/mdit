use std::path::Path;

use anyhow::Result;
use app_storage::migrations;

pub fn bootstrap_db(db_path: &Path) -> Result<()> {
    migrations::run_migrations_at(db_path)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::bootstrap_db;

    #[test]
    fn bootstraps_sqlite_database_with_migrations() {
        let db_path = unique_temp_path("sync-runtime-bootstrap");

        bootstrap_db(&db_path).expect("bootstrap db");

        assert!(db_path.exists());

        let _ = fs::remove_file(db_path);
    }

    fn unique_temp_path(prefix: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("{prefix}-{}.sqlite", unique_id()));
        path
    }

    fn unique_id() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos()
    }
}
