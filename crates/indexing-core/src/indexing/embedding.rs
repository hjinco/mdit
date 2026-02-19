use std::convert::TryFrom;

use anyhow::{anyhow, Context, Result};
use ollama_rs::{generation::embeddings::request::GenerateEmbeddingsRequest, Ollama};

#[derive(Debug)]
pub(crate) struct EmbeddingVector {
    pub(crate) dim: i32,
    pub(crate) bytes: Vec<u8>,
}

/// Supported providers that can generate embedding vectors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmbeddingProvider {
    Ollama,
}

impl EmbeddingProvider {
    /// Parse human input (e.g., CLI argument) into a provider enum.
    fn from_str(value: &str) -> Result<Self> {
        match value.trim().to_lowercase().as_str() {
            "ollama" => Ok(Self::Ollama),
            provider => Err(anyhow!(
                "Unsupported embedding provider '{}'. Only 'ollama' is currently supported.",
                provider
            )),
        }
    }
}

enum EmbeddingBackend {
    Ollama(Ollama),
}

pub(crate) struct EmbeddingClient {
    model: String,
    backend: EmbeddingBackend,
}

impl EmbeddingClient {
    /// Instantiate a concrete backend client for the requested provider.
    pub(crate) fn new(provider: &str, model: &str) -> Result<Self> {
        if model.trim().is_empty() {
            return Err(anyhow!("Embedding model must be provided"));
        }

        let provider = EmbeddingProvider::from_str(provider)?;
        let backend = match provider {
            EmbeddingProvider::Ollama => EmbeddingBackend::Ollama(Ollama::default()),
        };

        Ok(Self {
            model: model.to_string(),
            backend,
        })
    }

    pub(crate) fn model_name(&self) -> &str {
        &self.model
    }

    /// Generate an embedding vector for the supplied chunk using the selected backend.
    pub(crate) fn generate(&self, text: &str) -> Result<EmbeddingVector> {
        match &self.backend {
            EmbeddingBackend::Ollama(ollama) => self.generate_with_ollama(ollama, text),
        }
    }

    fn generate_with_ollama(&self, ollama: &Ollama, text: &str) -> Result<EmbeddingVector> {
        let model = self.model.clone();
        let prompt = text.to_string();

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("Failed to create async runtime for embedding request")?;

        let response = runtime.block_on(async {
            let request = GenerateEmbeddingsRequest::new(model, prompt.into());
            ollama
                .generate_embeddings(request)
                .await
                .context("Failed to generate embeddings with Ollama")
        })?;

        let mut embeddings = response.embeddings.into_iter();
        let mut vector = embeddings
            .next()
            .ok_or_else(|| anyhow!("Ollama returned an empty embeddings list"))?;

        if vector.is_empty() {
            return Err(anyhow!(
                "Ollama returned an embedding with zero dimensions for model '{}'",
                self.model
            ));
        }

        l2_normalize(&mut vector).with_context(|| {
            format!(
                "Embedding vector for model '{}' contained invalid values",
                self.model
            )
        })?;

        let dim = i32::try_from(vector.len())
            .map_err(|_| anyhow!("Embedding dimension {} exceeds i32::MAX", vector.len()))?;

        Ok(EmbeddingVector {
            dim,
            bytes: f32_slice_to_le_bytes(&vector),
        })
    }
}

/// Resolve the embedding dimension for a given provider and model by generating
/// a test embedding and extracting its dimension.
pub(crate) fn resolve_embedding_dimension(provider: &str, model: &str) -> Result<i32> {
    let embedder = EmbeddingClient::new(provider, model)?;
    let test_embedding = embedder.generate("test")?;
    Ok(test_embedding.dim)
}

fn f32_slice_to_le_bytes(values: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * std::mem::size_of::<f32>());
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn l2_normalize(values: &mut [f32]) -> Result<()> {
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm == 0.0 || !norm.is_finite() {
        return Err(anyhow!(
            "Embedding vector norm must be finite and non-zero for normalization"
        ));
    }

    for value in values {
        *value /= norm;
    }

    Ok(())
}
