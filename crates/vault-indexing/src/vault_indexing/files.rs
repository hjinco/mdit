use std::{
    ffi::OsStr,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use walkdir::{DirEntry, WalkDir};

/// Convenience holder for absolute + relative path of a Markdown source file.
#[derive(Debug)]
pub(crate) struct MarkdownFile {
    pub(crate) abs_path: PathBuf,
    pub(crate) rel_path: String,
    pub(crate) last_source_size: Option<i64>,
    pub(crate) last_source_mtime_ns: Option<i64>,
}

impl MarkdownFile {
    pub(crate) fn from_workspace_and_abs_path(
        workspace_root: &Path,
        abs_path: &Path,
    ) -> Result<Self> {
        let rel_path = abs_path.strip_prefix(workspace_root).with_context(|| {
            format!("Failed to compute relative path for {}", abs_path.display())
        })?;
        Ok(Self::from_abs_and_rel(
            abs_path.to_path_buf(),
            normalize_rel_path(rel_path),
        ))
    }

    pub(crate) fn from_abs_and_rel(abs_path: PathBuf, rel_path: String) -> Self {
        let source_stat = SourceFileStat::from_path(&abs_path);
        Self {
            abs_path,
            rel_path,
            last_source_size: source_stat.last_source_size,
            last_source_mtime_ns: source_stat.last_source_mtime_ns,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SourceFileStat {
    pub(crate) last_source_size: Option<i64>,
    pub(crate) last_source_mtime_ns: Option<i64>,
}

impl SourceFileStat {
    pub(crate) fn from_path(path: &Path) -> Self {
        let Ok(metadata) = std::fs::metadata(path) else {
            return Self::default();
        };

        Self {
            last_source_size: i64::try_from(metadata.len()).ok(),
            last_source_mtime_ns: metadata.modified().ok().and_then(system_time_to_nanos),
        }
    }
}

pub(crate) fn collect_markdown_files(workspace_root: &Path) -> Result<Vec<MarkdownFile>> {
    // Walk the tree lazily, skipping hidden dot-paths entirely.
    let walker = WalkDir::new(workspace_root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| should_descend(entry, workspace_root));

    let mut files = Vec::new();
    for entry in walker {
        let entry = entry.with_context(|| "Failed to traverse workspace")?;
        if entry.file_type().is_dir() {
            continue;
        }

        if !is_markdown(entry.path()) {
            continue;
        }

        files.push(MarkdownFile::from_workspace_and_abs_path(
            workspace_root,
            entry.path(),
        )?);
    }

    Ok(files)
}

fn should_descend(entry: &DirEntry, workspace_root: &Path) -> bool {
    if entry.path() == workspace_root {
        return true;
    }

    !is_hidden_workspace_path(entry.path(), workspace_root)
}

fn is_hidden_workspace_path(path: &Path, workspace_root: &Path) -> bool {
    path.strip_prefix(workspace_root)
        .ok()
        .is_some_and(|rel| rel.components().any(is_hidden_component))
}

fn is_hidden_component(component: Component<'_>) -> bool {
    matches!(component, Component::Normal(value) if is_hidden_name(value))
}

fn is_hidden_name(value: &OsStr) -> bool {
    let value = value.to_string_lossy();
    value.starts_with('.') && value != "." && value != ".."
}

fn is_markdown(path: &Path) -> bool {
    matches!(path.extension().and_then(OsStr::to_str), Some(ext) if ext.eq_ignore_ascii_case("md"))
}

pub(crate) fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn system_time_to_nanos(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_nanos()).ok())
}

#[cfg(test)]
mod tests {
    use super::collect_markdown_files;
    use std::{
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_workspace() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vault-indexing-files-test-{nanos}"));
        std::fs::create_dir_all(&path).expect("temp workspace should be created");
        path
    }

    fn write_file(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("parent directory should exist");
        }
        std::fs::write(path, "# note").expect("file should be written");
    }

    #[test]
    fn collect_markdown_files_skips_hidden_dot_paths() {
        let root = temp_workspace();
        write_file(&root.join("visible.md"));
        write_file(&root.join("docs/note.md"));
        write_file(&root.join(".hidden.md"));
        write_file(&root.join(".obsidian/workspace.md"));
        write_file(&root.join("docs/.cache/nested.md"));

        let mut rel_paths = collect_markdown_files(&root)
            .expect("markdown files should be collected")
            .into_iter()
            .map(|file| file.rel_path)
            .collect::<Vec<_>>();
        rel_paths.sort();

        assert_eq!(
            rel_paths,
            vec!["docs/note.md".to_string(), "visible.md".to_string()]
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
