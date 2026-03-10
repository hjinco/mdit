use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread::{self, JoinHandle},
};

use anyhow::{Context, Result};
use thiserror::Error;
use vault_indexing_api::{BacklinkEntry, ResolveWikiLinkRequest, VaultIndexingRuntime};
use vault_watch::{
    start_vault_watch, VaultEntryKind, VaultEntryState, VaultWatchBatch, VaultWatchError,
    VaultWatchOp, VaultWatcherHandle, WatchConfig,
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
    Batch(VaultWatchBatch),
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
    indexing_runtime: Arc<dyn VaultIndexingRuntime>,
    config: VaultIndexerConfig,
    mut on_batch: impl FnMut(VaultWatchBatch) + Send + 'static,
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
    let worker_thread = spawn_worker(
        canonical_workspace.clone(),
        db_path,
        indexing_runtime,
        worker_rx,
    );

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
    indexing_runtime: Arc<dyn VaultIndexingRuntime>,
    rx: Receiver<WorkerMessage>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        while let Ok(message) = rx.recv() {
            match message {
                WorkerMessage::StartupCatchup => {
                    if let Err(error) =
                        index_vault_documents(indexing_runtime.as_ref(), &workspace_path, &db_path)
                    {
                        eprintln!("vault-indexer: startup catch-up failed: {error:#}");
                    }
                }
                WorkerMessage::Batch(batch) => {
                    if let Err(error) =
                        process_batch(indexing_runtime.as_ref(), &workspace_path, &db_path, batch)
                    {
                        eprintln!("vault-indexer: failed to process batch: {error:#}");
                    }
                }
                WorkerMessage::Stop => break,
            }
        }
    })
}

fn process_batch(
    indexing_runtime: &dyn VaultIndexingRuntime,
    workspace_path: &Path,
    db_path: &Path,
    batch: VaultWatchBatch,
) -> Result<()> {
    let plan = build_indexing_plan(batch, workspace_path);
    if matches!(plan, IndexingPlan::FullReindex) {
        index_vault_documents(indexing_runtime, workspace_path, db_path)?;
        return Ok(());
    }

    let IndexingPlan::Incremental {
        index_targets,
        delete_targets,
        delete_prefix_targets,
        markdown_moves,
    } = plan
    else {
        unreachable!("full reindex already returned");
    };

    for (from_rel, to_rel) in markdown_moves {
        process_markdown_move(
            indexing_runtime,
            workspace_path,
            db_path,
            &from_rel,
            &to_rel,
        )?;
    }

    for note_path in delete_targets {
        if let Err(error) =
            indexing_runtime.delete_indexed_note(workspace_path, db_path, &note_path)
        {
            eprintln!(
                "vault-indexer: failed to delete indexed note {}: {error:#}",
                note_path.display()
            );
        }
    }

    let mut prefix_delete_failed = false;
    for path_prefix in delete_prefix_targets {
        if let Err(error) =
            indexing_runtime.delete_indexed_notes_by_prefix(workspace_path, db_path, &path_prefix)
        {
            prefix_delete_failed = true;
            eprintln!(
                "vault-indexer: failed to delete indexed notes by prefix {}: {error:#}",
                path_prefix.display()
            );
        }
    }

    if prefix_delete_failed {
        index_vault_documents(indexing_runtime, workspace_path, db_path)?;
        return Ok(());
    }

    for note_path in index_targets {
        if let Err(error) = indexing_runtime.index_note(workspace_path, db_path, &note_path) {
            eprintln!(
                "vault-indexer: failed to index note {}: {error:#}",
                note_path.display()
            );
        }
    }

    Ok(())
}

enum IndexingPlan {
    FullReindex,
    Incremental {
        index_targets: BTreeSet<PathBuf>,
        delete_targets: BTreeSet<PathBuf>,
        delete_prefix_targets: BTreeSet<PathBuf>,
        markdown_moves: Vec<(String, String)>,
    },
}

fn build_indexing_plan(batch: VaultWatchBatch, workspace_path: &Path) -> IndexingPlan {
    let mut index_targets: BTreeSet<PathBuf> = BTreeSet::new();
    let mut delete_targets: BTreeSet<PathBuf> = BTreeSet::new();
    let mut delete_prefix_targets: BTreeSet<PathBuf> = BTreeSet::new();
    let mut markdown_moves = Vec::new();

    for op in batch.ops {
        match op {
            VaultWatchOp::FullRescan { .. } | VaultWatchOp::ScanTree { .. } => {
                return IndexingPlan::FullReindex;
            }
            VaultWatchOp::PathState {
                rel_path,
                before,
                after,
            } => match (before, after) {
                (VaultEntryState::Missing, VaultEntryState::File)
                | (VaultEntryState::File, VaultEntryState::File) => {
                    if is_markdown_note_path(&rel_path) {
                        index_targets.insert(workspace_path.join(rel_path));
                    }
                }
                (VaultEntryState::File, VaultEntryState::Missing) => {
                    if is_markdown_note_path(&rel_path) {
                        delete_targets.insert(workspace_path.join(rel_path));
                    }
                }
                (VaultEntryState::Directory, VaultEntryState::Missing) => {
                    delete_prefix_targets.insert(workspace_path.join(rel_path));
                }
                (VaultEntryState::Missing, VaultEntryState::Directory)
                | (VaultEntryState::Directory, VaultEntryState::Directory)
                | (VaultEntryState::Missing, VaultEntryState::Missing) => {}
                _ => return IndexingPlan::FullReindex,
            },
            VaultWatchOp::Move {
                from_rel,
                to_rel,
                entry_kind: VaultEntryKind::File,
            } => {
                match (
                    is_markdown_note_path(&from_rel),
                    is_markdown_note_path(&to_rel),
                ) {
                    (true, true) => {
                        markdown_moves.push((from_rel, to_rel));
                    }
                    _ => return IndexingPlan::FullReindex,
                }
            }
            VaultWatchOp::Move {
                from_rel,
                to_rel,
                entry_kind: VaultEntryKind::Directory,
            } => {
                let _ = (from_rel, to_rel);
                return IndexingPlan::FullReindex;
            }
        }
    }

    IndexingPlan::Incremental {
        index_targets,
        delete_targets,
        delete_prefix_targets,
        markdown_moves,
    }
}

fn process_markdown_move(
    indexing_runtime: &dyn VaultIndexingRuntime,
    workspace_path: &Path,
    db_path: &Path,
    from_rel: &str,
    to_rel: &str,
) -> Result<()> {
    let old_note_path = workspace_path.join(from_rel);
    let new_note_path = workspace_path.join(to_rel);

    sync_backlinks_and_link_index(
        indexing_runtime,
        workspace_path,
        db_path,
        &old_note_path,
        &new_note_path,
    )
}

fn sync_backlinks_and_link_index(
    indexing_runtime: &dyn VaultIndexingRuntime,
    workspace_path: &Path,
    db_path: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
) -> Result<()> {
    let mut warnings: Vec<String> = Vec::new();

    let old_rel_path = to_workspace_rel_path(workspace_path, old_note_path)?;
    let new_wiki_target = to_wiki_target_from_abs_path(workspace_path, new_note_path);
    let workspace_path_string = normalize_slashes(&workspace_path.to_string_lossy());

    let backlinks = match indexing_runtime.get_backlinks(workspace_path, db_path, old_note_path) {
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

    let backlinks_to_new_target =
        match indexing_runtime.get_backlinks(workspace_path, db_path, new_note_path) {
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
            indexing_runtime,
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

    if let Err(error) =
        indexing_runtime.rename_indexed_note(workspace_path, db_path, old_note_path, new_note_path)
    {
        warnings.push("rename-indexed-note".to_string());
        eprintln!(
            "vault-indexer: failed to rename indexed note {} -> {}: {error:#}",
            old_note_path.display(),
            new_note_path.display()
        );
    }

    for note_path in index_targets {
        if let Err(error) = indexing_runtime.index_note(workspace_path, db_path, &note_path) {
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
    indexing_runtime: &dyn VaultIndexingRuntime,
    workspace_path: &Path,
    source_path: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
    old_rel_path: &str,
    new_wiki_target: &str,
    workspace_path_string: &str,
) -> Result<bool> {
    let metadata = std::fs::symlink_metadata(source_path).with_context(|| {
        format!(
            "failed to read backlink source metadata {}",
            source_path.display()
        )
    })?;
    if metadata.file_type().is_symlink() {
        eprintln!(
            "vault-indexer: skipping symlink backlink source {}",
            source_path.display()
        );
        return Ok(false);
    }

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

            let resolved = indexing_runtime.resolve_wiki_link(ResolveWikiLinkRequest {
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

fn index_vault_documents(
    indexing_runtime: &dyn VaultIndexingRuntime,
    workspace_path: &Path,
    db_path: &Path,
) -> Result<()> {
    indexing_runtime
        .index_vault_documents(workspace_path, db_path)
        .with_context(|| {
            format!(
                "failed to index vault documents for {}",
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

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use std::os::unix::fs as unix_fs;
    use std::{
        collections::{HashMap, HashSet},
        sync::Mutex,
    };

    use anyhow::{anyhow, Result};
    use vault_indexing_api::ResolveWikiLinkResult;

    use super::*;

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum RuntimeCall {
        IndexVaultDocuments,
        IndexNote(String),
        DeleteIndexedNote(String),
        DeleteIndexedNotesByPrefix(String),
        RenameIndexedNote { old_path: String, new_path: String },
        GetBacklinks(String),
        ResolveWikiLink(String),
    }

    #[derive(Default)]
    struct FakeVaultIndexingRuntime {
        calls: Mutex<Vec<RuntimeCall>>,
        failing_prefix_deletes: Mutex<HashSet<String>>,
        backlinks_by_path: Mutex<HashMap<String, Vec<BacklinkEntry>>>,
    }

    impl FakeVaultIndexingRuntime {
        fn calls(&self) -> Vec<RuntimeCall> {
            self.calls.lock().expect("calls lock poisoned").clone()
        }

        fn fail_prefix_delete_for(&self, path_prefix: &Path) {
            self.failing_prefix_deletes
                .lock()
                .expect("failing_prefix_deletes lock poisoned")
                .insert(normalize_path(path_prefix));
        }
    }

    impl VaultIndexingRuntime for FakeVaultIndexingRuntime {
        fn index_vault_documents(&self, _workspace_root: &Path, _db_path: &Path) -> Result<()> {
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::IndexVaultDocuments);
            Ok(())
        }

        fn index_note(
            &self,
            _workspace_root: &Path,
            _db_path: &Path,
            note_path: &Path,
        ) -> Result<()> {
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::IndexNote(normalize_path(note_path)));
            Ok(())
        }

        fn delete_indexed_note(
            &self,
            _workspace_root: &Path,
            _db_path: &Path,
            note_path: &Path,
        ) -> Result<()> {
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::DeleteIndexedNote(normalize_path(note_path)));
            Ok(())
        }

        fn delete_indexed_notes_by_prefix(
            &self,
            _workspace_root: &Path,
            _db_path: &Path,
            path_prefix: &Path,
        ) -> Result<()> {
            let normalized = normalize_path(path_prefix);
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::DeleteIndexedNotesByPrefix(normalized.clone()));

            if self
                .failing_prefix_deletes
                .lock()
                .expect("failing_prefix_deletes lock poisoned")
                .contains(&normalized)
            {
                return Err(anyhow!("simulated prefix delete failure"));
            }

            Ok(())
        }

        fn rename_indexed_note(
            &self,
            _workspace_root: &Path,
            _db_path: &Path,
            old_note_path: &Path,
            new_note_path: &Path,
        ) -> Result<()> {
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::RenameIndexedNote {
                    old_path: normalize_path(old_note_path),
                    new_path: normalize_path(new_note_path),
                });
            Ok(())
        }

        fn get_backlinks(
            &self,
            _workspace_root: &Path,
            _db_path: &Path,
            file_path: &Path,
        ) -> Result<Vec<BacklinkEntry>> {
            let key = normalize_path(file_path);
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::GetBacklinks(key.clone()));

            Ok(self
                .backlinks_by_path
                .lock()
                .expect("backlinks_by_path lock poisoned")
                .get(&key)
                .cloned()
                .unwrap_or_default())
        }

        fn resolve_wiki_link(
            &self,
            request: ResolveWikiLinkRequest,
        ) -> Result<ResolveWikiLinkResult> {
            self.calls
                .lock()
                .expect("calls lock poisoned")
                .push(RuntimeCall::ResolveWikiLink(request.raw_target.clone()));
            Ok(ResolveWikiLinkResult {
                canonical_target: request.raw_target,
                resolved_rel_path: None,
                match_count: 0,
                disambiguated: false,
                unresolved: true,
            })
        }
    }

    fn normalize_path(path: &Path) -> String {
        normalize_slashes(&path.to_string_lossy())
    }

    fn test_workspace_path() -> PathBuf {
        let root = std::env::temp_dir().join(format!("mdit-vault-indexer-{}", unique_id()));
        std::fs::create_dir_all(&root).expect("failed to create test workspace");
        root
    }

    fn unique_id() -> u128 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos()
    }

    fn empty_batch() -> VaultWatchBatch {
        VaultWatchBatch {
            stream_id: "stream-1".to_string(),
            seq_in_stream: 1,
            ops: Vec::new(),
            emitted_at_unix_ms: 0,
        }
    }

    #[test]
    fn rescan_batch_runs_workspace_index_only() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");

        let mut batch = empty_batch();
        batch.ops = vec![VaultWatchOp::FullRescan {
            reason: vault_watch::VaultWatchReason::WatcherError,
        }];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(runtime.calls(), vec![RuntimeCall::IndexVaultDocuments]);
    }

    #[test]
    fn create_modify_remove_batches_operate_on_markdown_paths_only() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");

        let mut batch = empty_batch();
        batch.ops = vec![
            VaultWatchOp::PathState {
                rel_path: "new.md".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::File,
            },
            VaultWatchOp::PathState {
                rel_path: "image.png".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::File,
            },
            VaultWatchOp::PathState {
                rel_path: "edit.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::File,
            },
            VaultWatchOp::PathState {
                rel_path: "note.txt".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::File,
            },
            VaultWatchOp::PathState {
                rel_path: "gone.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::Missing,
            },
            VaultWatchOp::PathState {
                rel_path: "diagram.svg".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::Missing,
            },
            VaultWatchOp::PathState {
                rel_path: "folder".to_string(),
                before: VaultEntryState::Directory,
                after: VaultEntryState::Missing,
            },
        ];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(
            runtime.calls(),
            vec![
                RuntimeCall::DeleteIndexedNote(normalize_path(&workspace.join("gone.md"))),
                RuntimeCall::DeleteIndexedNotesByPrefix(normalize_path(&workspace.join("folder"))),
                RuntimeCall::IndexNote(normalize_path(&workspace.join("edit.md"))),
                RuntimeCall::IndexNote(normalize_path(&workspace.join("new.md"))),
            ]
        );
    }

    #[test]
    fn markdown_move_runs_rename_and_reindex_for_new_note() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");

        let mut batch = empty_batch();
        batch.ops = vec![VaultWatchOp::Move {
            from_rel: "old.md".to_string(),
            to_rel: "new.md".to_string(),
            entry_kind: VaultEntryKind::File,
        }];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(
            runtime.calls(),
            vec![
                RuntimeCall::GetBacklinks(normalize_path(&workspace.join("old.md"))),
                RuntimeCall::GetBacklinks(normalize_path(&workspace.join("new.md"))),
                RuntimeCall::RenameIndexedNote {
                    old_path: normalize_path(&workspace.join("old.md")),
                    new_path: normalize_path(&workspace.join("new.md")),
                },
                RuntimeCall::IndexNote(normalize_path(&workspace.join("new.md"))),
            ]
        );
    }

    #[test]
    fn rename_with_mixed_file_types_triggers_workspace_rescan() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");

        let mut batch = empty_batch();
        batch.ops = vec![VaultWatchOp::Move {
            from_rel: "old.md".to_string(),
            to_rel: "old.txt".to_string(),
            entry_kind: VaultEntryKind::File,
        }];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(runtime.calls(), vec![RuntimeCall::IndexVaultDocuments]);
    }

    #[test]
    fn prefix_delete_failure_falls_back_to_workspace_rescan() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");
        let failing_prefix = workspace.join("folder");
        runtime.fail_prefix_delete_for(&failing_prefix);

        let mut batch = empty_batch();
        batch.ops = vec![VaultWatchOp::PathState {
            rel_path: "folder".to_string(),
            before: VaultEntryState::Directory,
            after: VaultEntryState::Missing,
        }];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(
            runtime.calls(),
            vec![
                RuntimeCall::DeleteIndexedNotesByPrefix(normalize_path(&workspace.join("folder"))),
                RuntimeCall::IndexVaultDocuments,
            ]
        );
    }

    #[test]
    fn moved_directory_triggers_workspace_rescan() {
        let workspace = test_workspace_path();
        let db_path = workspace.join("index.db");

        let runtime = FakeVaultIndexingRuntime::default();
        let mut batch = empty_batch();
        batch.ops = vec![VaultWatchOp::Move {
            from_rel: "docs".to_string(),
            to_rel: "archive".to_string(),
            entry_kind: VaultEntryKind::Directory,
        }];

        process_batch(&runtime, &workspace, &db_path, batch)
            .expect("batch processing should succeed");

        assert_eq!(runtime.calls(), vec![RuntimeCall::IndexVaultDocuments]);
    }

    #[cfg(unix)]
    #[test]
    fn rewrite_backlink_document_skips_symlink_sources() {
        let runtime = FakeVaultIndexingRuntime::default();
        let workspace = test_workspace_path();
        let old_note_path = workspace.join("old.md");
        let new_note_path = workspace.join("new.md");
        let source_path = workspace.join("backlink.md");
        let sensitive_path = workspace.with_extension("sensitive.md");

        std::fs::write(&sensitive_path, "[old](old.md)\n")
            .expect("failed to write sensitive target");
        unix_fs::symlink(&sensitive_path, &source_path).expect("failed to create symlink source");

        let workspace_path_string = normalize_slashes(&workspace.to_string_lossy());
        let rewritten = rewrite_backlink_document(
            &runtime,
            &workspace,
            &source_path,
            &old_note_path,
            &new_note_path,
            "old.md",
            "new",
            &workspace_path_string,
        )
        .expect("rewrite should succeed");

        assert!(!rewritten, "symlink sources should be skipped");
        assert_eq!(
            std::fs::read_to_string(&sensitive_path).expect("failed to read sensitive target"),
            "[old](old.md)\n"
        );
    }
}
