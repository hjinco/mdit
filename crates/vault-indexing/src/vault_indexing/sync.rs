use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use anyhow::{Context, Result};
use rusqlite::Connection;

use super::{
    chunking::{chunk_document, hash_content},
    files::MarkdownFile,
    links::LinkResolver,
    tags::NoteTag,
    EmbeddingContext, IndexSummary, TARGET_CHUNKING_VERSION,
};

mod doc_repo;
mod link_refresh;
mod policy;
mod segment_sync;
mod tag_refresh;

use doc_repo::{
    ensure_docs_for_files, load_docs, remove_deleted_docs, update_embedding_metadata,
    update_hash_and_content, update_source_stat, DocRecord,
};
use link_refresh::{
    bind_unresolved_links_for_inserted_docs, collect_query_keys_for_paths,
    load_forced_link_refresh_doc_ids, rel_path_query_keys, replace_links_for_doc,
};
use policy::{
    can_skip_file_without_loading, decide_document_sync_action, embedding_target_changed,
    FileSyncAction,
};
use segment_sync::{rebuild_doc_chunks, segments_match_current_chunks, sync_segments_for_doc};
use tag_refresh::replace_tags_for_doc;

pub(crate) struct PreparedDocument {
    pub(crate) file: MarkdownFile,
    contents: String,
    doc_hash: String,
    indexed_content: String,
    note_tags: Vec<NoteTag>,
}

impl PreparedDocument {
    pub(crate) fn load(file: MarkdownFile) -> Result<Self> {
        let contents = fs::read_to_string(&file.abs_path)
            .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;
        let doc_hash = hash_content(&contents);
        let indexed_content = note::format_indexing_text(&contents);
        let note_tags = super::tags::extract_note_tags(&contents);

        Ok(Self {
            file,
            contents,
            doc_hash,
            indexed_content,
            note_tags,
        })
    }

    fn chunks(&self) -> Vec<String> {
        chunk_document(&self.contents, TARGET_CHUNKING_VERSION)
    }
}

pub(super) fn clear_segment_vectors_for_vault(conn: &Connection, vault_id: i64) -> Result<()> {
    segment_sync::clear_segment_vectors_for_vault(conn, vault_id)
}

pub(crate) fn sync_documents_with_prune(
    conn: &mut Connection,
    workspace_root: &Path,
    vault_id: i64,
    files: Vec<MarkdownFile>,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
    prune_deleted_docs: bool,
) -> Result<Vec<PreparedDocument>> {
    let mut existing_docs = load_docs(conn, vault_id)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    let deleted_rel_paths = if prune_deleted_docs {
        remove_deleted_docs(conn, &mut existing_docs, &discovered, summary)?
    } else {
        Vec::new()
    };

    let inserted_docs = ensure_docs_for_files(conn, vault_id, &files, &mut existing_docs, summary)?;
    bind_unresolved_links_for_inserted_docs(conn, &inserted_docs)?;

    let mut affected_query_keys = collect_query_keys_for_paths(&deleted_rel_paths);
    for (rel_path, _doc_id) in &inserted_docs {
        for key in rel_path_query_keys(rel_path) {
            affected_query_keys.insert(key);
        }
    }

    let forced_link_refresh_doc_ids =
        load_forced_link_refresh_doc_ids(conn, vault_id, &affected_query_keys)?;

    let docs_by_path = existing_docs
        .iter()
        .map(|(rel_path, doc)| (rel_path.clone(), doc.id))
        .collect::<HashMap<_, _>>();
    let link_resolver = LinkResolver::new(workspace_root, docs_by_path);

    let mut prepared_documents = Vec::with_capacity(files.len());
    for file in files {
        let force_link_refresh_for_doc = existing_docs
            .get(&file.rel_path)
            .map(|doc| forced_link_refresh_doc_ids.contains(&doc.id))
            .unwrap_or(false);

        let Some(doc_record) = existing_docs.get(&file.rel_path) else {
            summary.skipped_files.push(format!(
                "{}: Missing document row during indexing",
                file.abs_path.display()
            ));
            continue;
        };

        if can_skip_file_without_loading(doc_record, &file, force_link_refresh_for_doc, embedding) {
            summary.files_processed += 1;
            continue;
        }

        let abs_path = file.abs_path.clone();
        let prepared = match PreparedDocument::load(file) {
            Ok(prepared) => prepared,
            Err(error) => {
                summary
                    .skipped_files
                    .push(format!("{}: {}", abs_path.display(), error));
                continue;
            }
        };

        let Some(doc_record) = existing_docs.get_mut(&prepared.file.rel_path) else {
            summary.skipped_files.push(format!(
                "{}: Missing document row during indexing",
                prepared.file.abs_path.display()
            ));
            continue;
        };

        if let Err(error) = sync_document_phase(
            conn,
            doc_record,
            &prepared,
            &link_resolver,
            force_link_refresh_for_doc,
            summary,
        ) {
            summary
                .skipped_files
                .push(format!("{}: {}", prepared.file.abs_path.display(), error));
            continue;
        }

        summary.files_processed += 1;
        prepared_documents.push(prepared);
    }

    Ok(prepared_documents)
}

pub(crate) fn sync_embeddings_for_prepared(
    conn: &mut Connection,
    vault_id: i64,
    prepared_documents: &[PreparedDocument],
    embedding: &EmbeddingContext,
    summary: &mut IndexSummary,
    count_processed_files: bool,
) -> Result<()> {
    let mut existing_docs = load_docs(conn, vault_id)?;

    for prepared in prepared_documents {
        let Some(doc_record) = existing_docs.get_mut(&prepared.file.rel_path) else {
            continue;
        };

        if let Err(error) = sync_embedding_phase(conn, doc_record, &prepared, embedding, summary) {
            summary
                .skipped_files
                .push(format!("{}: {}", prepared.file.abs_path.display(), error));
            continue;
        }

        if count_processed_files {
            summary.files_processed += 1;
        }
    }

    Ok(())
}

fn sync_document_phase(
    conn: &mut Connection,
    doc_record: &mut DocRecord,
    prepared: &PreparedDocument,
    link_resolver: &LinkResolver,
    force_link_refresh_for_doc: bool,
    summary: &mut IndexSummary,
) -> Result<()> {
    let source_stat_changed =
        match decide_document_sync_action(doc_record, &prepared.file, force_link_refresh_for_doc) {
            FileSyncAction::Skip => return Ok(()),
            FileSyncAction::Process {
                source_stat_changed,
            } => source_stat_changed,
        };

    let hash_changed = !doc_record.last_hash_matches(&prepared.doc_hash);
    if force_link_refresh_for_doc || hash_changed {
        let resolution =
            link_resolver.resolve_links_with_dependencies(&prepared.file, &prepared.contents);
        replace_links_for_doc(conn, doc_record.id, &resolution, summary)?;
    }

    if !hash_changed {
        if source_stat_changed {
            update_source_stat(conn, doc_record, &prepared.file)?;
        }
        return Ok(());
    }

    replace_tags_for_doc(conn, doc_record.id, &prepared.note_tags)?;
    update_hash_and_content(
        conn,
        doc_record,
        &prepared.doc_hash,
        &prepared.indexed_content,
        &prepared.file,
    )
}

fn sync_embedding_phase(
    conn: &mut Connection,
    doc_record: &mut DocRecord,
    prepared: &PreparedDocument,
    embedding: &EmbeddingContext,
    summary: &mut IndexSummary,
) -> Result<()> {
    if doc_record.last_hash.is_none() {
        return Ok(());
    }

    let embedding_target_changed = embedding_target_changed(
        doc_record,
        embedding.embedder.model_name(),
        embedding.target_dim,
    );
    let chunks = prepared.chunks();

    if doc_record.chunking_version == TARGET_CHUNKING_VERSION
        && !embedding_target_changed
        && segments_match_current_chunks(conn, doc_record.id, &chunks)?
    {
        return Ok(());
    }

    if doc_record.chunking_version != TARGET_CHUNKING_VERSION {
        rebuild_doc_chunks(conn, doc_record.id, &chunks, &embedding.embedder, summary)?;
        return update_embedding_metadata(
            conn,
            doc_record,
            embedding.embedder.model_name(),
            embedding.target_dim,
        );
    }

    sync_segments_for_doc(
        conn,
        doc_record.id,
        &chunks,
        &embedding.embedder,
        embedding_target_changed,
        summary,
    )?;

    if embedding_target_changed {
        update_embedding_metadata(
            conn,
            doc_record,
            embedding.embedder.model_name(),
            embedding.target_dim,
        )?;
    }

    Ok(())
}
