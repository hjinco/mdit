use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use anyhow::{anyhow, Context, Result};
use rusqlite::Connection;

use super::{
    chunking::{chunk_document, hash_content},
    files::MarkdownFile,
    links::LinkResolver,
    EmbeddingContext, IndexSummary, TARGET_CHUNKING_VERSION,
};

mod doc_repo;
mod link_refresh;
mod policy;
mod segment_sync;

use doc_repo::{
    ensure_docs_for_files, load_docs, remove_deleted_docs, update_full_metadata,
    update_hash_and_content, update_source_stat, DocRecord,
};
use link_refresh::{
    bind_unresolved_links_for_inserted_docs, collect_query_keys_for_paths,
    load_forced_link_refresh_doc_ids, rel_path_query_keys, replace_links_for_doc,
};
use policy::{decide_file_sync_action, embedding_target_changed, FileSyncAction};
use segment_sync::{rebuild_doc_chunks, sync_segments_for_doc};

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
) -> Result<()> {
    let mut existing_docs = load_docs(conn, vault_id)?;
    let discovered: HashSet<String> = files.iter().map(|file| file.rel_path.clone()).collect();

    let deleted_rel_paths = if prune_deleted_docs {
        // Remove rows for files that no longer exist before processing additions/updates.
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

    for file in files {
        let force_link_refresh_for_doc = existing_docs
            .get(&file.rel_path)
            .map(|doc| forced_link_refresh_doc_ids.contains(&doc.id))
            .unwrap_or(false);

        match process_file(
            conn,
            &file,
            &mut existing_docs,
            &link_resolver,
            force_link_refresh_for_doc,
            embedding,
            summary,
        ) {
            Ok(()) => summary.files_processed += 1,
            Err(error) => {
                summary
                    .skipped_files
                    .push(format!("{}: {}", file.abs_path.display(), error));
            }
        }
    }

    Ok(())
}

fn process_file(
    conn: &mut Connection,
    file: &MarkdownFile,
    docs: &mut HashMap<String, DocRecord>,
    link_resolver: &LinkResolver,
    force_link_refresh_for_doc: bool,
    embedding: Option<&EmbeddingContext>,
    summary: &mut IndexSummary,
) -> Result<()> {
    let doc_record = docs
        .get_mut(&file.rel_path)
        .ok_or_else(|| anyhow!("Missing document row for {} during indexing", file.rel_path))?;

    let source_stat_changed =
        match decide_file_sync_action(doc_record, file, force_link_refresh_for_doc, embedding) {
            FileSyncAction::Skip => return Ok(()),
            FileSyncAction::Process {
                source_stat_changed,
            } => source_stat_changed,
        };

    let contents = fs::read_to_string(&file.abs_path)
        .with_context(|| format!("Failed to read file {}", file.abs_path.display()))?;
    let doc_hash = hash_content(&contents);
    let indexed_content = note_core::format_indexing_text(&contents);

    let doc_id = doc_record.id;
    let hash_changed = !doc_record.links_up_to_date(&doc_hash);

    if force_link_refresh_for_doc || hash_changed {
        let resolution = link_resolver.resolve_links_with_dependencies(file, &contents);
        replace_links_for_doc(conn, doc_id, &resolution, summary)?;
    }

    let Some(embedding) = embedding else {
        if hash_changed {
            update_hash_and_content(conn, doc_record, &doc_hash, &indexed_content, file)?;
        } else if source_stat_changed {
            update_source_stat(conn, doc_record, file)?;
        }
        return Ok(());
    };

    let embedding_target_changed = embedding_target_changed(
        doc_record,
        embedding.embedder.model_name(),
        embedding.target_dim,
    );

    if doc_record.chunking_version != TARGET_CHUNKING_VERSION {
        let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);
        // Chunking algorithm changed, rebuild every segment and embedding.
        rebuild_doc_chunks(conn, doc_id, &chunks, &embedding.embedder, summary)?;
        update_full_metadata(
            conn,
            doc_record,
            &doc_hash,
            &indexed_content,
            file,
            embedding.embedder.model_name(),
            embedding.target_dim,
            hash_changed,
        )?;
        return Ok(());
    }

    if doc_record.is_up_to_date(
        &doc_hash,
        embedding.embedder.model_name(),
        embedding.target_dim,
    ) {
        if source_stat_changed {
            update_source_stat(conn, doc_record, file)?;
        }
        return Ok(());
    }

    let chunks = chunk_document(&contents, TARGET_CHUNKING_VERSION);
    // Fast path: only touch segments whose hash/vector drifted, unless model target changed.
    sync_segments_for_doc(
        conn,
        doc_id,
        &chunks,
        &embedding.embedder,
        embedding_target_changed,
        summary,
    )?;
    update_full_metadata(
        conn,
        doc_record,
        &doc_hash,
        &indexed_content,
        file,
        embedding.embedder.model_name(),
        embedding.target_dim,
        hash_changed,
    )
}
