use std::path::{Component, Path};

pub(crate) fn to_vault_rel_path(vault_root: &Path, event_path: &Path) -> Option<String> {
    let candidate = if event_path.is_absolute() {
        event_path.to_path_buf()
    } else {
        vault_root.join(event_path)
    };

    let rel = candidate.strip_prefix(vault_root).ok()?;
    normalize_rel_path(rel)
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
    use super::to_vault_rel_path;
    use std::path::Path;

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
}
