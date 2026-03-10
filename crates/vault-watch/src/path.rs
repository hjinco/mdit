use std::{
    fs,
    path::{Component, Path},
};

pub(crate) fn to_vault_rel_path(vault_root: &Path, event_path: &Path) -> Option<String> {
    let candidate = if event_path.is_absolute() {
        event_path.to_path_buf()
    } else {
        vault_root.join(event_path)
    };

    if has_symlink_ancestor(vault_root, &candidate) {
        return None;
    }

    let rel = candidate.strip_prefix(vault_root).ok()?;
    normalize_rel_path(rel)
}

pub(crate) fn is_hidden_vault_rel_path(rel_path: &str) -> bool {
    rel_path.split('/').any(|segment| {
        !segment.is_empty() && segment.starts_with('.') && segment != "." && segment != ".."
    })
}

fn has_symlink_ancestor(vault_root: &Path, candidate: &Path) -> bool {
    let Ok(relative_path) = candidate.strip_prefix(vault_root) else {
        return false;
    };

    let mut cursor = vault_root.to_path_buf();
    for component in relative_path.components() {
        match component {
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => continue,
            Component::Normal(part) => {
                cursor.push(part);
            }
        }

        if fs::symlink_metadata(&cursor).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return true;
        }
    }

    false
}

fn normalize_rel_path(path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if parts.is_empty() {
        return None;
    }

    Some(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::{is_hidden_vault_rel_path, to_vault_rel_path};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_vault_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vault-watch-path-test-{nanos}"));
        fs::create_dir_all(&path).expect("temp vault should be created");
        path
    }

    #[test]
    fn converts_absolute_path_inside_vault() {
        let root = Path::new("/vault");
        let path = Path::new("/vault/a/b.md");
        assert_eq!(to_vault_rel_path(root, path).as_deref(), Some("a/b.md"));
    }

    #[test]
    fn rejects_absolute_path_outside_vault() {
        let root = Path::new("/vault");
        let path = Path::new("/other/a.md");
        assert_eq!(to_vault_rel_path(root, path), None);
    }

    #[test]
    fn normalizes_relative_path_against_vault() {
        let root = Path::new("/vault");
        let path = Path::new("a/b.md");
        assert_eq!(to_vault_rel_path(root, path).as_deref(), Some("a/b.md"));
    }

    #[test]
    fn rejects_parent_traversal() {
        let root = Path::new("/vault");
        let path = Path::new("../outside.md");
        assert_eq!(to_vault_rel_path(root, path), None);
    }

    #[test]
    fn hidden_rel_path_matches_dot_prefixed_segments() {
        assert!(is_hidden_vault_rel_path(".obsidian"));
        assert!(is_hidden_vault_rel_path("docs/.cache/note.md"));
        assert!(!is_hidden_vault_rel_path("docs/note.md"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_path_with_symlink_ancestor_inside_vault() {
        let root = temp_vault_dir();
        let real_dir = root.join("real");
        let link_dir = root.join("link");
        fs::create_dir_all(&real_dir).expect("real dir should be created");
        std::os::unix::fs::symlink(&real_dir, &link_dir).expect("symlink dir should be created");

        let candidate = link_dir.join("note.md");
        assert_eq!(to_vault_rel_path(&root, &candidate), None);

        let _ = fs::remove_dir_all(&root);
    }
}
