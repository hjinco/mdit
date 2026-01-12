use std::{
    cmp::Ordering,
    collections::HashMap,
    convert::TryFrom,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection};
use serde::Serialize;

use super::embedding::EmbeddingClient;
use crate::migrations;

const MIN_QUERY_SIMILARITY: f32 = 0.35;
const MIN_NOTE_BYTES: u64 = 256;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SemanticNoteEntry {
    pub path: String,
    pub name: String,
    pub created_at: Option<i64>,
    pub modified_at: Option<i64>,
    pub similarity: f32,
}

struct DocAggregate {
    rel_path: String,
    segment_similarities: Vec<f32>,
}

pub(crate) fn search_notes_for_query(
    workspace_root: &Path,
    query: &str,
    embedding_provider: &str,
    embedding_model: &str,
) -> Result<Vec<SemanticNoteEntry>> {
    if !workspace_root.exists() {
        return Err(anyhow!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        ));
    }

    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(Vec::new());
    }

    if embedding_provider.trim().is_empty() {
        return Err(anyhow!("Embedding provider must be provided"));
    }

    if embedding_model.trim().is_empty() {
        return Err(anyhow!("Embedding model must be provided"));
    }

    let embedder = EmbeddingClient::new(embedding_provider, embedding_model)?;
    let query_embedding = embedder.generate(trimmed_query)?;
    let query_vector = bytes_to_f32_vec(&query_embedding.bytes)?;
    if query_vector.is_empty() || !query_vector.iter().all(|value| value.is_finite()) {
        return Ok(Vec::new());
    }

    let db_path = migrations::run_workspace_migrations(workspace_root)?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open workspace database at {}", db_path.display()))?;

    let mut stmt = conn.prepare(
        "SELECT d.id, d.rel_path, e.vec \
         FROM doc d \
         JOIN segment s ON s.doc_id = d.id \
         JOIN embedding e ON e.segment_id = s.id \
         WHERE d.last_embedding_model = ?1 AND d.last_embedding_dim = ?2",
    )?;

    let rows = stmt.query_map(params![embedder.model_name(), query_embedding.dim], |row| {
        let doc_id: i64 = row.get(0)?;
        let rel_path: String = row.get(1)?;
        let vec_blob: Vec<u8> = row.get(2)?;
        Ok((doc_id, rel_path, vec_blob))
    })?;

    let mut doc_vectors: HashMap<i64, DocAggregate> = HashMap::new();

    for row in rows {
        let (doc_id, rel_path, vec_blob) = row?;
        if !is_markdown(&rel_path) {
            continue;
        }

        let segment_vector = match bytes_to_f32_vec(&vec_blob) {
            Ok(vector) => vector,
            Err(_) => continue,
        };

        if segment_vector.len() != query_vector.len() {
            continue;
        }

        let similarity = dot_product(&query_vector, &segment_vector);
        if !similarity.is_finite() {
            continue;
        }

        let entry = doc_vectors.entry(doc_id).or_insert_with(|| DocAggregate {
            rel_path: rel_path.clone(),
            segment_similarities: Vec::new(),
        });

        entry.segment_similarities.push(similarity);
    }

    let mut scored_entries = Vec::new();

    for aggregate in doc_vectors.into_values() {
        let DocAggregate {
            rel_path,
            segment_similarities,
        } = aggregate;

        if segment_similarities.is_empty() {
            continue;
        }

        let mut max_similarity: Option<f32> = None;
        for similarity in segment_similarities.into_iter() {
            if !similarity.is_finite() {
                continue;
            }

            max_similarity = match max_similarity {
                Some(current_max) if similarity <= current_max => Some(current_max),
                _ => Some(similarity),
            };
        }

        let Some(similarity) = max_similarity else {
            continue;
        };
        if !similarity.is_finite() || similarity < MIN_QUERY_SIMILARITY {
            continue;
        }

        let absolute_path = workspace_root.join(&rel_path);
        if !absolute_path.exists() {
            continue;
        }

        if let Some(entry) = build_entry(absolute_path, similarity)? {
            scored_entries.push((similarity, entry));
        }
    }

    scored_entries.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or_else(|| Ordering::Equal));

    Ok(scored_entries.into_iter().map(|(_, entry)| entry).collect())
}

fn bytes_to_f32_vec(bytes: &[u8]) -> Result<Vec<f32>> {
    if bytes.len() % 4 != 0 {
        return Err(anyhow!(
            "Embedding vector length {} is not divisible by 4",
            bytes.len()
        ));
    }

    let mut values = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.chunks_exact(4) {
        let arr = <[u8; 4]>::try_from(chunk).unwrap();
        values.push(f32::from_le_bytes(arr));
    }
    Ok(values)
}

fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(lhs, rhs)| lhs * rhs).sum()
}

fn is_markdown(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn build_entry(path: PathBuf, similarity: f32) -> Result<Option<SemanticNoteEntry>> {
    if !path.exists() {
        return Ok(None);
    }

    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(None),
    };

    if metadata.len() < MIN_NOTE_BYTES {
        return Ok(None);
    }

    let created_at = metadata.created().ok().and_then(system_time_to_millis);
    let modified_at = metadata.modified().ok().and_then(system_time_to_millis);

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    Ok(Some(SemanticNoteEntry {
        path: path.to_string_lossy().into_owned(),
        name,
        created_at,
        modified_at,
        similarity,
    }))
}

fn system_time_to_millis(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
}
