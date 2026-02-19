use super::super::{files::MarkdownFile, EmbeddingContext, TARGET_CHUNKING_VERSION};
use super::doc_repo::DocRecord;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FileSyncAction {
    Skip,
    Process { source_stat_changed: bool },
}

pub(super) fn decide_file_sync_action(
    doc_record: &DocRecord,
    file: &MarkdownFile,
    force_link_refresh_for_doc: bool,
    embedding: Option<&EmbeddingContext>,
) -> FileSyncAction {
    let source_stat_changed = !doc_record.source_stat_matches(file);
    if !force_link_refresh_for_doc
        && !source_stat_changed
        && doc_record.chunking_version == TARGET_CHUNKING_VERSION
        && doc_record.last_hash.is_some()
        && embedding_target_matches(doc_record, embedding)
    {
        return FileSyncAction::Skip;
    }

    FileSyncAction::Process {
        source_stat_changed,
    }
}

pub(super) fn embedding_target_changed(
    doc_record: &DocRecord,
    model: &str,
    target_dim: i32,
) -> bool {
    doc_record.last_embedding_model.as_deref() != Some(model)
        || doc_record.last_embedding_dim != Some(target_dim)
}

fn embedding_target_matches(doc_record: &DocRecord, embedding: Option<&EmbeddingContext>) -> bool {
    let Some(embedding) = embedding else {
        return true;
    };

    doc_record.last_embedding_model.as_deref() == Some(embedding.embedder.model_name())
        && doc_record.last_embedding_dim == Some(embedding.target_dim)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{decide_file_sync_action, embedding_target_changed, FileSyncAction};
    use crate::indexing::{files::MarkdownFile, TARGET_CHUNKING_VERSION};

    use super::super::doc_repo::DocRecord;

    fn make_doc(model: Option<&str>, dim: Option<i32>) -> DocRecord {
        DocRecord {
            id: 1,
            chunking_version: 2,
            last_hash: Some("hash".to_string()),
            last_source_size: Some(10),
            last_source_mtime_ns: Some(20),
            last_embedding_model: model.map(|value| value.to_string()),
            last_embedding_dim: dim,
        }
    }

    fn make_file(size: i64, mtime_ns: i64) -> MarkdownFile {
        MarkdownFile {
            abs_path: PathBuf::from("/tmp/test.md"),
            rel_path: "test.md".to_string(),
            last_source_size: Some(size),
            last_source_mtime_ns: Some(mtime_ns),
        }
    }

    #[test]
    fn embedding_target_unchanged_returns_false() {
        let doc = make_doc(Some("nomic-embed-text"), Some(768));
        assert!(!embedding_target_changed(&doc, "nomic-embed-text", 768));
    }

    #[test]
    fn embedding_target_changed_returns_true_for_model_or_dim_drift() {
        let doc = make_doc(Some("nomic-embed-text"), Some(768));
        assert!(embedding_target_changed(&doc, "other-model", 768));
        assert!(embedding_target_changed(&doc, "nomic-embed-text", 1024));
    }

    #[test]
    fn embedding_target_changed_returns_true_when_metadata_missing() {
        let doc = make_doc(None, None);
        assert!(embedding_target_changed(&doc, "nomic-embed-text", 768));
    }

    #[test]
    fn chunk_version_mismatch_forces_processing_even_when_other_metadata_matches() {
        let mut doc = make_doc(Some("nomic-embed-text"), Some(768));
        doc.chunking_version = TARGET_CHUNKING_VERSION + 1;
        let file = make_file(10, 20);

        let action = decide_file_sync_action(&doc, &file, false, None);

        assert_eq!(
            action,
            FileSyncAction::Process {
                source_stat_changed: false
            }
        );
    }

    #[test]
    fn matching_chunk_version_allows_skip_when_everything_else_matches() {
        let mut doc = make_doc(Some("nomic-embed-text"), Some(768));
        doc.chunking_version = TARGET_CHUNKING_VERSION;
        let file = make_file(10, 20);

        let action = decide_file_sync_action(&doc, &file, false, None);

        assert_eq!(action, FileSyncAction::Skip);
    }
}
