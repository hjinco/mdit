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

const VECTOR_WEIGHT: f32 = 0.7;
const BM25_WEIGHT: f32 = 0.3;
const MIN_FINAL_SCORE: f32 = 0.05;
const MIN_NOTE_BYTES: u64 = 256;
const SEGMENT_VEC_TABLE: &str = "segment_vec";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SemanticNoteEntry {
    pub path: String,
    pub name: String,
    pub created_at: Option<i64>,
    pub modified_at: Option<i64>,
    pub similarity: f32,
}

#[derive(Debug, Default)]
struct DocScore {
    rel_path: String,
    bm25: Option<f32>,
    vector: Option<f32>,
}

#[derive(Debug, Clone)]
pub(super) struct ScoreInput {
    pub(super) rel_path: String,
    pub(super) bm25: Option<f32>,
    pub(super) vector: Option<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct RankedCandidate {
    pub(super) rel_path: String,
    pub(super) similarity: f32,
}

pub(crate) fn search_notes_for_query(
    workspace_root: &Path,
    db_path: &Path,
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

    let conn = open_search_connection(db_path)?;

    let Some(vault_id) = super::find_vault_id(&conn, workspace_root)? else {
        return Ok(Vec::new());
    };

    let mut scores: HashMap<i64, DocScore> = HashMap::new();

    for (doc_id, rel_path, bm25_score) in load_bm25_scores(&conn, vault_id, trimmed_query)? {
        if !is_markdown(&rel_path) {
            continue;
        }

        let entry = scores.entry(doc_id).or_default();
        if entry.rel_path.is_empty() {
            entry.rel_path = rel_path;
        }
        entry.bm25 = Some(bm25_score);
    }

    for (doc_id, rel_path, vector_score) in load_vector_scores(
        &conn,
        vault_id,
        embedder.model_name(),
        query_embedding.dim,
        &query_embedding.bytes,
    )? {
        if !is_markdown(&rel_path) {
            continue;
        }

        let entry = scores.entry(doc_id).or_default();
        if entry.rel_path.is_empty() {
            entry.rel_path = rel_path;
        }
        entry.vector = Some(vector_score);
    }

    let candidates = scores
        .into_values()
        .map(|score| ScoreInput {
            rel_path: score.rel_path,
            bm25: score.bm25,
            vector: score.vector,
        })
        .collect::<Vec<_>>();
    let ranked_candidates = rank_score_inputs(candidates);
    materialize_ranked_entries(workspace_root, ranked_candidates)
}

fn open_search_connection(db_path: &Path) -> Result<Connection> {
    crate::sqlite_vec_ext::register_auto_extension()?;

    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open indexing database at {}", db_path.display()))?;

    conn.pragma_update(None, "foreign_keys", 1)
        .context("Failed to enable foreign keys for indexing database")?;

    Ok(conn)
}

fn load_bm25_scores(
    conn: &Connection,
    vault_id: i64,
    query: &str,
) -> Result<Vec<(i64, String, f32)>> {
    let fts_query = build_fts_query(query);

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.rel_path, bm25(doc_fts) \
             FROM doc_fts \
             JOIN doc d ON d.id = doc_fts.rowid \
             WHERE d.vault_id = ?1 AND doc_fts MATCH ?2",
        )
        .context("Failed to prepare BM25 query")?;

    let rows = stmt
        .query_map(params![vault_id, fts_query], |row| {
            let doc_id: i64 = row.get(0)?;
            let rel_path: String = row.get(1)?;
            let bm25_raw: f64 = row.get(2)?;
            Ok((doc_id, rel_path, bm25_raw as f32))
        })
        .context("Failed to run BM25 query")?;

    let mut output = Vec::new();
    for row in rows {
        let (doc_id, rel_path, bm25_raw) = row?;
        if !bm25_raw.is_finite() {
            continue;
        }

        // Lower BM25 values are better; invert so larger means more relevant.
        output.push((doc_id, rel_path, -bm25_raw));
    }

    Ok(output)
}

fn load_vector_scores(
    conn: &Connection,
    vault_id: i64,
    embedding_model: &str,
    embedding_dim: i32,
    query_embedding_bytes: &[u8],
) -> Result<Vec<(i64, String, f32)>> {
    if !segment_vec_table_exists(conn)? {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.rel_path, MAX(1.0 - vec_distance_cosine(sv.embedding, vec_f32(?4))) AS vector_score \
             FROM doc d \
             JOIN segment s ON s.doc_id = d.id \
             JOIN segment_vec sv ON sv.rowid = s.id \
             WHERE d.vault_id = ?1 \
               AND d.last_embedding_model = ?2 \
               AND d.last_embedding_dim = ?3 \
             GROUP BY d.id, d.rel_path",
        )
        .context("Failed to prepare vector similarity query")?;

    let rows = stmt
        .query_map(
            params![
                vault_id,
                embedding_model,
                embedding_dim,
                query_embedding_bytes
            ],
            |row| {
                let doc_id: i64 = row.get(0)?;
                let rel_path: String = row.get(1)?;
                let vector_score: Option<f64> = row.get(2)?;
                Ok((doc_id, rel_path, vector_score))
            },
        )
        .context("Failed to run vector similarity query")?;

    let mut output = Vec::new();
    for row in rows {
        let (doc_id, rel_path, vector_score) = row?;
        let Some(score) = vector_score else {
            continue;
        };

        let score = score as f32;
        if !score.is_finite() {
            continue;
        }

        output.push((doc_id, rel_path, score));
    }

    Ok(output)
}

fn segment_vec_table_exists(conn: &Connection) -> Result<bool> {
    let exists: i64 = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            params![SEGMENT_VEC_TABLE],
            |row| row.get(0),
        )
        .context("Failed to check segment_vec table existence")?;

    Ok(exists != 0)
}

fn build_fts_query(raw_query: &str) -> String {
    // Escape double quotes and search as a phrase to avoid FTS syntax errors.
    let escaped = raw_query.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn metric_bounds(values: impl Iterator<Item = f32>) -> Option<(f32, f32)> {
    let mut min = f32::INFINITY;
    let mut max = f32::NEG_INFINITY;

    for value in values {
        if !value.is_finite() {
            continue;
        }

        if value < min {
            min = value;
        }
        if value > max {
            max = value;
        }
    }

    if min.is_infinite() || max.is_infinite() {
        return None;
    }

    Some((min, max))
}

fn normalize_metric(value: Option<f32>, bounds: Option<(f32, f32)>) -> f32 {
    let Some(value) = value else {
        return 0.0;
    };
    let Some((min, max)) = bounds else {
        return 0.0;
    };

    if !value.is_finite() {
        return 0.0;
    }

    let span = max - min;
    if span.abs() < f32::EPSILON {
        return 1.0;
    }

    ((value - min) / span).clamp(0.0, 1.0)
}

pub(super) fn rank_score_inputs(inputs: Vec<ScoreInput>) -> Vec<RankedCandidate> {
    let bm25_bounds = metric_bounds(inputs.iter().filter_map(|input| input.bm25));
    let vector_bounds = metric_bounds(inputs.iter().filter_map(|input| input.vector));

    let mut ranked = Vec::new();
    for input in inputs {
        if input.rel_path.is_empty() || !is_markdown(&input.rel_path) {
            continue;
        }

        let bm25_norm = normalize_metric(input.bm25, bm25_bounds);
        let vector_norm = normalize_metric(input.vector, vector_bounds);
        let final_score = vector_norm * VECTOR_WEIGHT + bm25_norm * BM25_WEIGHT;
        if !final_score.is_finite() || final_score < MIN_FINAL_SCORE {
            continue;
        }

        ranked.push(RankedCandidate {
            rel_path: input.rel_path,
            similarity: final_score,
        });
    }

    ranked.sort_by(|left, right| {
        right
            .similarity
            .partial_cmp(&left.similarity)
            .unwrap_or(Ordering::Equal)
    });
    ranked
}

pub(super) fn materialize_ranked_entries(
    workspace_root: &Path,
    ranked_candidates: Vec<RankedCandidate>,
) -> Result<Vec<SemanticNoteEntry>> {
    let mut entries = Vec::new();
    for candidate in ranked_candidates {
        let absolute_path = workspace_root.join(&candidate.rel_path);
        if let Some(entry) = build_entry(absolute_path, candidate.similarity)? {
            entries.push(entry);
        }
    }
    Ok(entries)
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
