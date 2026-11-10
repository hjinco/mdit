use std::{
    fs::{self, OpenOptions},
    io::{self, ErrorKind, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use glob::MatchOptions;
use same_file::Handle;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{fs::Scope, utils::config::FsScope, Manager, Runtime, Webview};
use tauri_plugin_fs::{FsExt, SafeFilePath};

static DOCUMENT_WRITES: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DocumentFile {
    content: String,
    revision: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WriteDocumentResult {
    Saved { revision: String },
    Changed { document: DocumentFile },
    Deleted,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RenameDocumentResult {
    Renamed { revision: String },
    Changed { document: DocumentFile },
    Deleted,
}

struct FileSnapshot {
    bytes: Vec<u8>,
    revision: String,
    handle: Handle,
}

impl FileSnapshot {
    fn into_document(self) -> io::Result<DocumentFile> {
        // Match the filesystem plugin's UTF-8 decoder for the visible note.
        // Revisions are computed from the original bytes, including a BOM.
        let mut content = String::from_utf8(self.bytes)
            .map_err(|error| io::Error::new(ErrorKind::InvalidData, error))?;
        if content.starts_with('\u{feff}') {
            content.remove(0);
        }
        Ok(DocumentFile {
            content,
            revision: self.revision,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ScopePath {
    Path(PathBuf),
    Entry { path: PathBuf },
}

impl ScopePath {
    fn path(&self) -> PathBuf {
        match self {
            Self::Path(path) | Self::Entry { path } => path.clone(),
        }
    }
}

fn document_scope<R: Runtime>(
    webview: &Webview<R>,
    commands: &[&str],
) -> Result<impl Fn(&Path, &Path) -> bool, String> {
    let options = MatchOptions {
        require_literal_separator: true,
        require_literal_leading_dot: webview
            .config()
            .plugins
            .0
            .get("fs")
            .and_then(|config| config.get("requireLiteralLeadingDot"))
            .and_then(|value| value.as_bool())
            .unwrap_or(cfg!(unix)),
        ..Default::default()
    };
    let dynamic_scope = webview.fs_scope();
    let mut command_scopes = Vec::new();

    for command in commands {
        let scope = webview
            .resolve_command_scope::<ScopePath>("fs", command)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("File access is not permitted for {command}"))?;
        let global = scope.global_scope();
        let local = scope.command_scope();
        command_scopes.push(
            Scope::new(
                webview,
                &FsScope::Scope {
                    allow: global
                        .allows()
                        .iter()
                        .chain(local.allows())
                        .map(|entry| entry.path())
                        .collect(),
                    deny: global
                        .denies()
                        .iter()
                        .chain(local.denies())
                        .map(|entry| entry.path())
                        .collect(),
                    require_literal_leading_dot: Some(options.require_literal_leading_dot),
                },
            )
            .map_err(|error| error.to_string())?,
        );
    }

    Ok(move |requested_path: &Path, resolved_path: &Path| {
        let requested: PathBuf = requested_path.components().collect();
        let resolved: PathBuf = resolved_path.components().collect();
        // The plugin checks denies on the alias as well as its resolved target.
        let denied = |scope: &Scope| {
            scope.forbidden_patterns().iter().any(|pattern| {
                pattern.matches_path_with(&requested, options)
                    || pattern.matches_path_with(&resolved, options)
            })
        };
        let dynamically_allowed = dynamic_scope.is_allowed(&resolved);
        !denied(&dynamic_scope)
            && command_scopes
                .iter()
                .all(|scope| !denied(scope) && (dynamically_allowed || scope.is_allowed(&resolved)))
    })
}

fn markdown_path(path: SafeFilePath) -> Result<PathBuf, String> {
    let path = path.into_path().map_err(|error| error.to_string())?;
    if !path.extension().is_some_and(|extension| {
        extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
    }) {
        return Err("Expected a Markdown file path".into());
    }
    Ok(path)
}

#[tauri::command]
pub async fn read_document_file<R: Runtime>(
    webview: Webview<R>,
    path: SafeFilePath,
) -> Result<Option<DocumentFile>, String> {
    let path = markdown_path(path)?;
    let allows = document_scope(&webview, &["read_text_file"])?;
    tauri::async_runtime::spawn_blocking(move || {
        lock_document_writes()
            .and_then(|_guard| read_current(&path, &allows))
            .and_then(|current| {
                current
                    .map(|(_, snapshot)| snapshot.into_document())
                    .transpose()
            })
            .map_err(|error| format!("Failed to read {}: {error}", path.display()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_document_file<R: Runtime>(
    webview: Webview<R>,
    path: SafeFilePath,
    expected_revision: Option<String>,
    content: String,
) -> Result<WriteDocumentResult, String> {
    let path = markdown_path(path)?;
    let allows = document_scope(&webview, &["read_text_file", "write_text_file"])?;
    tauri::async_runtime::spawn_blocking(move || {
        write_document(&path, expected_revision.as_deref(), &content, &allows)
            .map_err(|error| format!("Failed to save {}: {error}", path.display()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rename_document_file<R: Runtime>(
    webview: Webview<R>,
    old_path: SafeFilePath,
    new_path: SafeFilePath,
    expected_revision: String,
) -> Result<RenameDocumentResult, String> {
    let old_path = markdown_path(old_path)?;
    let new_path = markdown_path(new_path)?;
    let read_and_rename = document_scope(&webview, &["read_text_file", "rename"])?;
    let rename_only = document_scope(&webview, &["rename"])?;
    tauri::async_runtime::spawn_blocking(move || {
        rename_document(
            &old_path,
            &new_path,
            &expected_revision,
            &read_and_rename,
            &rename_only,
        )
        .map_err(|error| format!("Failed to rename {}: {error}", old_path.display()))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn lock_document_writes() -> io::Result<MutexGuard<'static, ()>> {
    DOCUMENT_WRITES
        .lock()
        .map_err(|_| io::Error::other("Document write lock is poisoned"))
}

fn revision(path: &Path, bytes: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(path.as_os_str().as_encoded_bytes());
    hash.update([0]);
    hash.update(bytes);
    format!("{:x}", hash.finalize())
}

fn canonical_parent(path: &Path) -> io::Result<PathBuf> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::canonicalize(parent)
}

fn ensure_allowed(
    requested: &Path,
    resolved: &Path,
    allows: &impl Fn(&Path, &Path) -> bool,
) -> io::Result<()> {
    if !allows(requested, resolved) {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "File access denied",
        ));
    }
    Ok(())
}

fn read_current(
    requested: &Path,
    allows: &impl Fn(&Path, &Path) -> bool,
) -> io::Result<Option<(PathBuf, FileSnapshot)>> {
    let result = (|| {
        let resolved = fs::canonicalize(requested)?;
        ensure_allowed(requested, &resolved, allows)?;
        if !fs::symlink_metadata(&resolved)?.is_file() {
            return Err(io::Error::other("Expected a regular file"));
        }
        let mut handle = Handle::from_file(fs::File::open(&resolved)?)?;
        let mut bytes = Vec::new();
        handle.as_file_mut().read_to_end(&mut bytes)?;
        let revision = revision(&resolved, &bytes);
        Ok((
            resolved,
            FileSnapshot {
                bytes,
                revision,
                handle,
            },
        ))
    })();
    match result {
        Ok(snapshot) => Ok(Some(snapshot)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn write_document(
    requested: &Path,
    expected_revision: Option<&str>,
    content: &str,
    allows: &impl Fn(&Path, &Path) -> bool,
) -> io::Result<WriteDocumentResult> {
    let _guard = lock_document_writes()?;
    let Some((path, snapshot)) = read_current(requested, allows)? else {
        return if expected_revision.is_none() {
            create_document(requested, content, allows)
        } else {
            Ok(WriteDocumentResult::Deleted)
        };
    };

    if Some(snapshot.revision.as_str()) != expected_revision {
        return Ok(WriteDocumentResult::Changed {
            document: snapshot.into_document()?,
        });
    }
    if snapshot.bytes == content.as_bytes() {
        return Ok(WriteDocumentResult::Saved {
            revision: snapshot.revision,
        });
    }

    let mut handle = match OpenOptions::new().write(true).open(&path) {
        Ok(file) => Handle::from_file(file)?,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(WriteDocumentResult::Deleted)
        }
        Err(error) => return Err(error),
    };
    // Check that the writable handle still refers to the scoped, unchanged file.
    match read_current(requested, allows)? {
        Some((resolved, current))
            if resolved == path
                && current.revision == snapshot.revision
                && current.handle == handle =>
        {
            // Keep the inode so creation dates, hard links, and other metadata survive.
            let file = handle.as_file_mut();
            if let Err(error) = write_existing_contents(file, content.as_bytes()) {
                write_existing_contents(file, &current.bytes).map_err(|restore_error| {
                    io::Error::new(
                        error.kind(),
                        format!(
                            "{error}. Failed to restore the original contents: {restore_error}"
                        ),
                    )
                })?;
                return Err(error);
            }
            Ok(WriteDocumentResult::Saved {
                revision: revision(&path, content.as_bytes()),
            })
        }
        Some((_, current)) => Ok(WriteDocumentResult::Changed {
            document: current.into_document()?,
        }),
        None => Ok(WriteDocumentResult::Deleted),
    }
}

fn write_existing_contents(file: &mut fs::File, bytes: &[u8]) -> io::Result<()> {
    file.rewind()?;
    file.write_all(bytes)?;
    file.set_len(bytes.len() as u64)?;
    file.sync_all()
}

fn create_document(
    requested: &Path,
    content: &str,
    allows: &impl Fn(&Path, &Path) -> bool,
) -> io::Result<WriteDocumentResult> {
    let parent = canonical_parent(requested)?;
    let name = requested
        .file_name()
        .ok_or_else(|| io::Error::other("Missing document name"))?;
    let path = parent.join(name);
    ensure_allowed(requested, &path, allows)?;

    let mut builder = tempfile::Builder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o666));
    }
    let mut replacement = builder.tempfile_in(&parent)?;
    replacement.write_all(content.as_bytes())?;
    replacement.as_file().sync_all()?;
    if canonical_parent(requested)? != parent {
        return Err(io::Error::other(
            "Document directory changed before creation",
        ));
    }

    match replacement.persist_noclobber(&path) {
        Ok(_) => {
            let resolved = fs::canonicalize(&path).unwrap_or(path);
            Ok(WriteDocumentResult::Saved {
                revision: revision(&resolved, content.as_bytes()),
            })
        }
        Err(error) if error.error.kind() == ErrorKind::AlreadyExists => {
            let (_, current) = read_current(requested, allows)?
                .ok_or_else(|| io::Error::other("The document path is occupied"))?;
            Ok(WriteDocumentResult::Changed {
                document: current.into_document()?,
            })
        }
        Err(error) => Err(error.error),
    }
}

fn rename_document(
    old_path: &Path,
    new_path: &Path,
    expected_revision: &str,
    allows_source: &impl Fn(&Path, &Path) -> bool,
    allows_target: &impl Fn(&Path, &Path) -> bool,
) -> io::Result<RenameDocumentResult> {
    let _guard = lock_document_writes()?;
    let Some((source, snapshot)) = read_current(old_path, allows_source)? else {
        return Ok(RenameDocumentResult::Deleted);
    };
    if snapshot.revision != expected_revision {
        return Ok(RenameDocumentResult::Changed {
            document: snapshot.into_document()?,
        });
    }

    let parent = canonical_parent(old_path)?;
    if parent != canonical_parent(new_path)? {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "A document rename must stay in its directory",
        ));
    }
    let (Some(old_name), Some(new_name)) = (old_path.file_name(), new_path.file_name()) else {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "Missing document name",
        ));
    };
    let source_entry = parent.join(old_name);
    let target_entry = parent.join(new_name);
    let name_collision = || {
        io::Error::new(
            ErrorKind::AlreadyExists,
            "A file with this name already exists",
        )
    };
    let target = match fs::symlink_metadata(&target_entry) {
        Ok(_) => Some(fs::canonicalize(&target_entry).map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                name_collision()
            } else {
                error
            }
        })?),
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    ensure_allowed(
        new_path,
        target.as_deref().unwrap_or(&target_entry),
        allows_target,
    )?;

    let mut already_named = source_entry == target_entry;
    if let Some(target) = target.filter(|_| !already_named) {
        let folded_name = old_name.to_string_lossy().to_lowercase();
        if target != source || folded_name != new_name.to_string_lossy().to_lowercase() {
            return Err(name_collision());
        }
        // Two case variants can be distinct entries even if both links lead to
        // the same canonical target. Only accept a single real directory entry.
        let mut existing_name = None;
        for entry in fs::read_dir(&parent)? {
            let name = entry?.file_name();
            if name.to_string_lossy().to_lowercase() == folded_name
                && existing_name.replace(name).is_some()
            {
                return Err(name_collision());
            }
        }
        already_named = existing_name.ok_or_else(name_collision)? == new_name;
    }

    let Some((resolved, current)) = read_current(old_path, allows_source)? else {
        return Ok(RenameDocumentResult::Deleted);
    };
    if resolved != source || current.revision != expected_revision {
        return Ok(RenameDocumentResult::Changed {
            document: current.into_document()?,
        });
    }
    if canonical_parent(new_path)? != parent || canonical_parent(old_path)? != parent {
        return Err(io::Error::other("Document directory changed before rename"));
    }
    if !already_named {
        fs::rename(source_entry, &target_entry)?;
    }
    let resolved = fs::canonicalize(&target_entry).unwrap_or(target_entry);
    Ok(RenameDocumentResult::Renamed {
        revision: revision(&resolved, &current.bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allow_file(_: &Path, _: &Path) -> bool {
        true
    }

    fn read(path: &Path) -> DocumentFile {
        read_current(path, &allow_file)
            .unwrap()
            .unwrap()
            .1
            .into_document()
            .unwrap()
    }

    #[test]
    fn creates_missing_notes_and_refuses_to_clobber_existing_ones() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let result = write_document(&path, None, "initial", &allow_file).unwrap();
        let original = read(&path);
        assert_eq!(
            result,
            WriteDocumentResult::Saved {
                revision: original.revision.clone(),
            }
        );
        assert_eq!(
            write_document(&path, None, "another draft", &allow_file).unwrap(),
            WriteDocumentResult::Changed {
                document: original.clone(),
            }
        );
        fs::remove_file(&path).unwrap();
        assert_eq!(
            write_document(&path, Some(&original.revision), "edit", &allow_file).unwrap(),
            WriteDocumentResult::Deleted
        );
        assert!(!path.exists());
    }

    #[test]
    fn compares_raw_content_even_when_the_visible_text_is_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "\u{feff}initial").unwrap();
        let first = read(&path);
        fs::write(&path, "initial").unwrap();
        let current = read(&path);
        assert_eq!(first.content, current.content);
        assert_ne!(first.revision, current.revision);
        assert_eq!(
            write_document(&path, Some(&first.revision), "draft", &allow_file).unwrap(),
            WriteDocumentResult::Changed { document: current }
        );
    }

    #[test]
    fn writing_preserves_hard_links_and_creation_time() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let linked = dir.path().join("linked.md");
        fs::write(&path, "long original").unwrap();
        fs::hard_link(&path, &linked).unwrap();
        let original = read(&path);
        let created = fs::metadata(&path).unwrap().created().ok();

        let result = write_document(&path, Some(&original.revision), "edit", &allow_file).unwrap();

        assert_eq!(
            result,
            WriteDocumentResult::Saved {
                revision: read(&path).revision,
            }
        );
        assert_eq!(read(&path).content, "edit");
        assert_eq!(read(&linked).content, "edit");
        assert_eq!(fs::metadata(&path).unwrap().created().ok(), created);
    }

    #[test]
    fn concurrent_writes_cannot_overwrite_the_first_save() {
        use std::{sync::Barrier, thread};

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "initial").unwrap();
        let original = read(&path);
        let barrier = Barrier::new(2);
        let results = thread::scope(|scope| {
            let (path, revision, barrier) = (&path, &original.revision, &barrier);
            let spawn_write = |content| {
                scope.spawn(move || {
                    barrier.wait();
                    write_document(path, Some(revision), content, &allow_file).unwrap()
                })
            };
            let first = spawn_write("first");
            let second = spawn_write("second");
            [first.join().unwrap(), second.join().unwrap()]
        });
        let document = read(&path);
        assert!(results.contains(&WriteDocumentResult::Saved {
            revision: document.revision.clone(),
        }));
        assert!(results.contains(&WriteDocumentResult::Changed { document }));
    }

    #[test]
    fn rename_guards_the_source_revision_and_the_destination_name() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source.md");
        let target = dir.path().join("target.md");
        fs::write(&source, "initial").unwrap();
        let original = read(&source);
        fs::write(&source, "external change").unwrap();
        let current = read(&source);
        assert_eq!(
            rename_document(
                &source,
                &target,
                &original.revision,
                &allow_file,
                &allow_file
            )
            .unwrap(),
            RenameDocumentResult::Changed {
                document: current.clone()
            }
        );
        assert!(!target.exists());
        fs::write(&target, "occupied").unwrap();
        assert_eq!(
            rename_document(
                &source,
                &target,
                &current.revision,
                &allow_file,
                &allow_file
            )
            .unwrap_err()
            .kind(),
            ErrorKind::AlreadyExists
        );
        assert_eq!(read(&target).content, "occupied");
        assert_eq!(read(&source), current);
    }

    #[test]
    fn case_rename_returns_the_revision_at_the_new_path() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("Title.md");
        let target = dir.path().join("title.md");
        fs::write(&source, "initial").unwrap();
        let original = read(&source);
        let result = rename_document(
            &source,
            &target,
            &original.revision,
            &allow_file,
            &allow_file,
        )
        .unwrap();
        assert_eq!(
            result,
            RenameDocumentResult::Renamed {
                revision: read(&target).revision
            }
        );
        let names = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, ["title.md"]);
    }

    #[cfg(unix)]
    #[test]
    fn writing_preserves_mode_and_rejects_a_retargeted_symlink() {
        use std::{
            cell::Cell,
            os::unix::fs::{symlink, PermissionsExt},
        };

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let old_target = dir.path().join("old.md");
        let new_target = dir.path().join("new.md");
        fs::write(&old_target, "initial").unwrap();
        fs::set_permissions(&old_target, fs::Permissions::from_mode(0o640)).unwrap();
        fs::write(&new_target, "initial").unwrap();
        symlink(&old_target, &path).unwrap();

        let original = read(&path);
        let WriteDocumentResult::Saved { revision } =
            write_document(&path, Some(&original.revision), "first edit", &allow_file).unwrap()
        else {
            panic!("expected a save");
        };
        assert!(path.is_symlink());
        assert_eq!(
            fs::metadata(&old_target).unwrap().permissions().mode() & 0o777,
            0o640
        );

        let retargeted = Cell::new(false);
        let result = write_document(&path, Some(&revision), "second edit", &|_, _| {
            if !retargeted.replace(true) {
                fs::remove_file(&path).unwrap();
                symlink(&new_target, &path).unwrap();
            }
            true
        });
        assert_eq!(
            result.unwrap(),
            WriteDocumentResult::Changed {
                document: read(&path)
            }
        );
        assert_eq!(read(&old_target).content, "first edit");
        assert_eq!(read(&new_target).content, "initial");
    }
}
