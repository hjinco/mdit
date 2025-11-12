use std::{
    ffi::OsStr,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result};
use walkdir::{DirEntry, WalkDir};

const STATE_DIR_NAME: &str = ".mdit";

/// Convenience holder for absolute + relative path of a Markdown source file.
#[derive(Debug)]
pub(crate) struct MarkdownFile {
    pub(crate) abs_path: PathBuf,
    pub(crate) rel_path: String,
}

pub(crate) fn collect_markdown_files(workspace_root: &Path) -> Result<Vec<MarkdownFile>> {
    // Walk the tree lazily, skipping dot-directories such as the state folder.
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

        let rel_path = entry.path().strip_prefix(workspace_root).with_context(|| {
            format!(
                "Failed to compute relative path for {}",
                entry.path().display()
            )
        })?;

        files.push(MarkdownFile {
            abs_path: entry.path().to_path_buf(),
            rel_path: normalize_rel_path(rel_path),
        });
    }

    Ok(files)
}

fn should_descend(entry: &DirEntry, workspace_root: &Path) -> bool {
    if entry.path() == workspace_root {
        return true;
    }

    !is_inside_state_dir(entry.path(), workspace_root)
}

fn is_inside_state_dir(path: &Path, workspace_root: &Path) -> bool {
    if let Ok(rel) = path.strip_prefix(workspace_root) {
        if let Some(Component::Normal(component)) = rel.components().next() {
            return component == OsStr::new(STATE_DIR_NAME);
        }
    }
    false
}

fn is_markdown(path: &Path) -> bool {
    matches!(path.extension().and_then(OsStr::to_str), Some(ext) if ext.eq_ignore_ascii_case("md"))
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
