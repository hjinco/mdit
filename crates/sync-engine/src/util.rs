use std::{
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};

pub(crate) fn relative_workspace_path(workspace_root: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(workspace_root).with_context(|| {
        format!(
            "Path {} is not inside workspace {}",
            path.display(),
            workspace_root.display()
        )
    })?;
    Ok(normalize_path(relative))
}

pub(crate) fn workspace_absolute_path(
    workspace_root: &Path,
    relative_path: &str,
) -> Result<PathBuf> {
    let mut resolved = workspace_root.to_path_buf();
    let mut components = Path::new(relative_path).components().peekable();
    if components.peek().is_none() {
        return Err(anyhow::anyhow!("Workspace-relative path must not be empty"));
    }

    for component in components {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => resolved.push(OsString::from(part)),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(anyhow::anyhow!(
                    "Invalid workspace-relative path: {}",
                    relative_path
                ));
            }
        }
    }

    Ok(resolved)
}

pub(crate) fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(crate) fn modified_time_ns(metadata: &fs::Metadata) -> Option<i64> {
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(duration.as_nanos()).ok()
}

pub(crate) fn now_iso_string() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{now}")
}
