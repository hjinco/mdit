use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver, Sender},
    thread::{self, JoinHandle},
};

use anyhow::{Context, Result};
use vault_indexing::{
    delete_indexed_note, delete_indexed_notes_by_prefix, get_backlinks, index_note,
    index_workspace, rename_indexed_note, resolve_wiki_link, BacklinkEntry, ResolveWikiLinkRequest,
};
use thiserror::Error;
use vault_watch::{
    start_vault_watch, EventBatch, RenamePair, VaultWatchError, VaultWatcherHandle, WatchConfig,
};

use crate::rewrite::{
    collect_wiki_link_targets, does_wiki_target_refer_to_rel_path, is_external_wiki_target,
    normalize_slashes, rewrite_markdown_links_for_renamed_target, rewrite_wiki_link_targets,
    split_wiki_target_suffix, to_wiki_target_from_abs_path, with_preserved_surrounding_whitespace,
};

#[derive(Debug, Clone)]
pub struct VaultIndexerConfig {
    pub watch_config: WatchConfig,
    pub startup_catchup: bool,
}

impl Default for VaultIndexerConfig {
    fn default() -> Self {
        Self {
            watch_config: WatchConfig::default(),
            startup_catchup: true,
        }
    }
}

#[derive(Debug, Error)]
pub enum VaultIndexerError {
    #[error("failed to canonicalize workspace path {path}: {source}")]
    CanonicalizeWorkspace {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to start vault watch: {0}")]
    StartWatch(#[from] VaultWatchError),
    #[error("failed to send worker message")]
    WorkerChannel,
    #[error("failed to stop vault watch: {0}")]
    StopWatch(#[source] VaultWatchError),
    #[error("failed to join worker thread")]
    WorkerJoin,
}

enum WorkerMessage {
    StartupCatchup,
    Batch(EventBatch),
    Stop,
}

pub struct VaultIndexerHandle {
    watcher: Option<VaultWatcherHandle>,
    worker_tx: Option<Sender<WorkerMessage>>,
    worker_thread: Option<JoinHandle<()>>,
    stopped: bool,
}

impl VaultIndexerHandle {
    pub fn stop(mut self) -> Result<(), VaultIndexerError> {
        self.stop_inner()
    }

    fn stop_inner(&mut self) -> Result<(), VaultIndexerError> {
        if self.stopped {
            return Ok(());
        }

        let watch_result = if let Some(watcher) = self.watcher.take() {
            watcher.stop().map_err(VaultIndexerError::StopWatch)
        } else {
            Ok(())
        };

        if let Some(tx) = self.worker_tx.take() {
            let _ = tx.send(WorkerMessage::Stop);
        }

        if let Some(handle) = self.worker_thread.take() {
            handle.join().map_err(|_| VaultIndexerError::WorkerJoin)?;
        }

        self.stopped = true;
        watch_result
    }
}

impl Drop for VaultIndexerHandle {
    fn drop(&mut self) {
        let _ = self.stop_inner();
    }
}

pub fn start_vault_indexer(
    workspace_path: impl AsRef<Path>,
    db_path: impl AsRef<Path>,
    config: VaultIndexerConfig,
    mut on_batch: impl FnMut(EventBatch) + Send + 'static,
) -> Result<VaultIndexerHandle, VaultIndexerError> {
    let workspace_path = workspace_path.as_ref();
    let canonical_workspace = std::fs::canonicalize(workspace_path).map_err(|source| {
        VaultIndexerError::CanonicalizeWorkspace {
            path: workspace_path.display().to_string(),
            source,
        }
    })?;

    let db_path = db_path.as_ref().to_path_buf();
    let (worker_tx, worker_rx) = mpsc::channel::<WorkerMessage>();
    let worker_thread = spawn_worker(canonical_workspace.clone(), db_path, worker_rx);

    if config.startup_catchup {
        worker_tx
            .send(WorkerMessage::StartupCatchup)
            .map_err(|_| VaultIndexerError::WorkerChannel)?;
    }

    let callback_tx = worker_tx.clone();
    let watcher = start_vault_watch(
        canonical_workspace.clone(),
        config.watch_config,
        move |batch| {
            on_batch(batch.clone());
            if callback_tx.send(WorkerMessage::Batch(batch)).is_err() {
                eprintln!("vault-indexer: failed to enqueue watch batch");
            }
        },
    )?;

    Ok(VaultIndexerHandle {
        watcher: Some(watcher),
        worker_tx: Some(worker_tx),
        worker_thread: Some(worker_thread),
        stopped: false,
    })
}

fn spawn_worker(
    workspace_path: PathBuf,
    db_path: PathBuf,
    rx: Receiver<WorkerMessage>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        while let Ok(message) = rx.recv() {
            match message {
                WorkerMessage::StartupCatchup => {
                    if let Err(error) = run_workspace_index(&workspace_path, &db_path) {
                        eprintln!("vault-indexer: startup catch-up failed: {error:#}");
                    }
                }
                WorkerMessage::Batch(batch) => {
                    if let Err(error) = process_batch(&workspace_path, &db_path, batch) {
                        eprintln!("vault-indexer: failed to process batch: {error:#}");
                    }
                }
                WorkerMessage::Stop => break,
            }
        }
    })
}

fn process_batch(workspace_path: &Path, db_path: &Path, batch: EventBatch) -> Result<()> {
    if batch.rescan {
        run_workspace_index(workspace_path, db_path)?;
        return Ok(());
    }

    let mut requires_rescan = false;
    let mut index_targets: BTreeSet<PathBuf> = BTreeSet::new();
    let mut delete_targets: BTreeSet<PathBuf> = BTreeSet::new();
    let mut delete_prefix_targets: BTreeSet<PathBuf> = BTreeSet::new();

    for rel_path in batch.vault_rel_removed {
        if should_ignore_rel_path(&rel_path) {
            continue;
        }

        if is_markdown_note_path(&rel_path) {
            delete_targets.insert(workspace_path.join(rel_path));
        }
    }

    for rel_path in batch.vault_rel_removed_dirs {
        if should_ignore_rel_path(&rel_path) {
            continue;
        }

        delete_prefix_targets.insert(workspace_path.join(rel_path));
    }

    for rel_path in batch
        .vault_rel_created
        .into_iter()
        .chain(batch.vault_rel_modified.into_iter())
    {
        if should_ignore_rel_path(&rel_path) {
            continue;
        }

        if is_markdown_note_path(&rel_path) {
            index_targets.insert(workspace_path.join(rel_path));
        }
    }

    for rename in batch.vault_rel_renamed {
        let from_ignored = should_ignore_rel_path(&rename.from_rel);
        let to_ignored = should_ignore_rel_path(&rename.to_rel);

        match (
            is_markdown_note_path(&rename.from_rel),
            is_markdown_note_path(&rename.to_rel),
            from_ignored,
            to_ignored,
        ) {
            (true, true, false, false) => {
                process_markdown_rename(workspace_path, db_path, &rename)?;
            }
            (true, false, false, true) => {
                delete_targets.insert(workspace_path.join(rename.from_rel));
            }
            (false, true, true, false) => {
                index_targets.insert(workspace_path.join(rename.to_rel));
            }
            (_, _, true, true) => {}
            _ => {
                requires_rescan = true;
            }
        }
    }

    if requires_rescan {
        run_workspace_index(workspace_path, db_path)?;
        return Ok(());
    }

    for note_path in delete_targets {
        if let Err(error) = delete_indexed_note(workspace_path, db_path, &note_path) {
            eprintln!(
                "vault-indexer: failed to delete indexed note {}: {error:#}",
                note_path.display()
            );
        }
    }

    let mut prefix_delete_failed = false;
    for path_prefix in delete_prefix_targets {
        if let Err(error) = delete_indexed_notes_by_prefix(workspace_path, db_path, &path_prefix) {
            prefix_delete_failed = true;
            eprintln!(
                "vault-indexer: failed to delete indexed notes by prefix {}: {error:#}",
                path_prefix.display()
            );
        }
    }

    if prefix_delete_failed {
        run_workspace_index(workspace_path, db_path)?;
        return Ok(());
    }

    for note_path in index_targets {
        if let Err(error) = index_note(workspace_path, db_path, &note_path, "", "") {
            eprintln!(
                "vault-indexer: failed to index note {}: {error:#}",
                note_path.display()
            );
        }
    }

    Ok(())
}

fn process_markdown_rename(
    workspace_path: &Path,
    db_path: &Path,
    rename: &RenamePair,
) -> Result<()> {
    let old_note_path = workspace_path.join(&rename.from_rel);
    let new_note_path = workspace_path.join(&rename.to_rel);

    sync_backlinks_and_link_index(workspace_path, db_path, &old_note_path, &new_note_path)
}

fn sync_backlinks_and_link_index(
    workspace_path: &Path,
    db_path: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
) -> Result<()> {
    let mut warnings: Vec<String> = Vec::new();

    let old_rel_path = to_workspace_rel_path(workspace_path, old_note_path)?;
    let new_wiki_target = to_wiki_target_from_abs_path(workspace_path, new_note_path);
    let workspace_path_string = normalize_slashes(&workspace_path.to_string_lossy());

    let backlinks = match get_backlinks(workspace_path, db_path, old_note_path) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push("load-backlinks".to_string());
            eprintln!(
                "vault-indexer: failed to load backlinks before rename {} -> {}: {error:#}",
                old_note_path.display(),
                new_note_path.display()
            );
            Vec::new()
        }
    };

    let backlinks_to_new_target = match get_backlinks(workspace_path, db_path, new_note_path) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push("load-new-backlinks".to_string());
            eprintln!(
                "vault-indexer: failed to load unresolved backlinks for {}: {error:#}",
                new_note_path.display()
            );
            Vec::new()
        }
    };

    let mut index_targets: BTreeSet<PathBuf> = BTreeSet::new();
    index_targets.insert(new_note_path.to_path_buf());

    for backlink in backlinks {
        let source_path =
            resolve_source_path(workspace_path, &backlink, old_note_path, new_note_path);
        if !is_markdown_note_abs_path(&source_path) {
            continue;
        }

        index_targets.insert(source_path.clone());

        if let Err(error) = rewrite_backlink_document(
            workspace_path,
            source_path.as_path(),
            old_note_path,
            new_note_path,
            &old_rel_path,
            &new_wiki_target,
            &workspace_path_string,
        ) {
            warnings.push(format!(
                "rewrite:{}",
                normalize_slashes(&source_path.to_string_lossy())
            ));
            eprintln!(
                "vault-indexer: failed to rewrite backlink document {}: {error:#}",
                source_path.display()
            );
        }
    }

    for backlink in backlinks_to_new_target {
        let source_path =
            resolve_source_path(workspace_path, &backlink, old_note_path, new_note_path);
        if !is_markdown_note_abs_path(&source_path) {
            continue;
        }
        index_targets.insert(source_path);
    }

    if let Err(error) = rename_indexed_note(workspace_path, db_path, old_note_path, new_note_path) {
        warnings.push("rename-indexed-note".to_string());
        eprintln!(
            "vault-indexer: failed to rename indexed note {} -> {}: {error:#}",
            old_note_path.display(),
            new_note_path.display()
        );
    }

    for note_path in index_targets {
        if let Err(error) = index_note(workspace_path, db_path, &note_path, "", "") {
            warnings.push(format!(
                "index:{}",
                normalize_slashes(&note_path.to_string_lossy())
            ));
            eprintln!(
                "vault-indexer: failed to refresh indexed note {}: {error:#}",
                note_path.display()
            );
        }
    }

    if !warnings.is_empty() {
        eprintln!(
            "vault-indexer: rename completed with warnings {} -> {}: {:?}",
            old_note_path.display(),
            new_note_path.display(),
            warnings
        );
    }

    Ok(())
}

fn rewrite_backlink_document(
    workspace_path: &Path,
    source_path: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
    old_rel_path: &str,
    new_wiki_target: &str,
    workspace_path_string: &str,
) -> Result<bool> {
    let original_content = std::fs::read_to_string(source_path)
        .with_context(|| format!("failed to read backlink source {}", source_path.display()))?;

    let source_dir = source_path.parent().unwrap_or(workspace_path);
    let mut updated_content = rewrite_markdown_links_for_renamed_target(
        &original_content,
        source_dir,
        old_note_path,
        new_note_path,
    );

    let wiki_targets = collect_wiki_link_targets(&updated_content);
    if !wiki_targets.is_empty() {
        let mut replacements: HashMap<String, String> = HashMap::new();

        for raw_wiki_target in wiki_targets {
            let trimmed_target = raw_wiki_target.trim();
            if trimmed_target.is_empty() || is_external_wiki_target(trimmed_target) {
                continue;
            }

            let resolved = resolve_wiki_link(ResolveWikiLinkRequest {
                workspace_path: workspace_path_string.to_string(),
                current_note_path: Some(normalize_slashes(&source_path.to_string_lossy())),
                raw_target: trimmed_target.to_string(),
                workspace_rel_paths: None,
            });

            let resolved = match resolved {
                Ok(value) => value,
                Err(error) => {
                    eprintln!(
                        "vault-indexer: failed to resolve wiki target '{}' in {}: {error:#}",
                        trimmed_target,
                        source_path.display()
                    );
                    continue;
                }
            };

            let resolved_rel = resolved
                .resolved_rel_path
                .as_deref()
                .map(normalize_slashes)
                .unwrap_or_default();
            let matches_by_resolver = resolved_rel == normalize_slashes(old_rel_path);
            let matches_by_fallback = resolved.unresolved
                && does_wiki_target_refer_to_rel_path(trimmed_target, old_rel_path);

            if !matches_by_resolver && !matches_by_fallback {
                continue;
            }

            let (_, suffix) = split_wiki_target_suffix(trimmed_target);
            replacements.insert(
                raw_wiki_target.clone(),
                with_preserved_surrounding_whitespace(
                    &raw_wiki_target,
                    &format!("{new_wiki_target}{suffix}"),
                ),
            );
        }

        if !replacements.is_empty() {
            updated_content = rewrite_wiki_link_targets(&updated_content, &replacements);
        }
    }

    if updated_content == original_content {
        return Ok(false);
    }

    std::fs::write(source_path, updated_content).with_context(|| {
        format!(
            "failed to write rewritten backlink source {}",
            source_path.display()
        )
    })?;

    Ok(true)
}

fn resolve_source_path(
    workspace_path: &Path,
    backlink: &BacklinkEntry,
    old_note_path: &Path,
    new_note_path: &Path,
) -> PathBuf {
    let source_path = workspace_path.join(&backlink.rel_path);
    if normalized_abs_eq(&source_path, old_note_path) {
        new_note_path.to_path_buf()
    } else {
        source_path
    }
}

fn normalized_abs_eq(left: &Path, right: &Path) -> bool {
    normalize_slashes(&left.to_string_lossy()) == normalize_slashes(&right.to_string_lossy())
}

fn run_workspace_index(workspace_path: &Path, db_path: &Path) -> Result<()> {
    index_workspace(workspace_path, db_path, "", "", false)
        .map(|_| ())
        .with_context(|| {
            format!(
                "failed to run workspace indexing for {}",
                workspace_path.display()
            )
        })
}

fn to_workspace_rel_path(workspace_path: &Path, note_path: &Path) -> Result<String> {
    note_path
        .strip_prefix(workspace_path)
        .map(|path| normalize_slashes(&path.to_string_lossy()))
        .with_context(|| {
            format!(
                "failed to resolve relative path for {} within {}",
                note_path.display(),
                workspace_path.display()
            )
        })
}

fn is_markdown_note_abs_path(path: &Path) -> bool {
    path.to_string_lossy().to_ascii_lowercase().ends_with(".md")
}

fn is_markdown_note_path(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".md")
}

fn should_ignore_rel_path(path: &str) -> bool {
    let normalized = normalize_slashes(path);
    normalized == ".mdit" || normalized.starts_with(".mdit/")
}
