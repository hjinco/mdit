use std::collections::BTreeSet;

use anyhow::{anyhow, Context, Result};
use ollama_rs::{generation::embeddings::request::GenerateEmbeddingsRequest, Ollama};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OllamaModelCatalog {
    pub completion_models: Vec<String>,
    pub embedding_models: Vec<String>,
}

pub struct BlockingOllamaEmbeddingClient {
    runtime: tokio::runtime::Runtime,
    ollama: Ollama,
}

#[derive(Debug, Clone)]
enum ModelCapabilities {
    Known(Vec<String>),
    Unavailable,
}

pub fn list_model_catalog() -> Result<OllamaModelCatalog> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("Failed to create async runtime for Ollama model catalog")?;
    let ollama = Ollama::default();

    let local_models = runtime
        .block_on(async { ollama.list_local_models().await })
        .context("Failed to list local models from Ollama")?;

    let mut inspections = Vec::with_capacity(local_models.len());
    for model in local_models {
        let model_name = model.name.trim().to_string();
        if model_name.is_empty() {
            continue;
        }

        let show_result =
            runtime.block_on(async { ollama.show_model_info(model_name.clone()).await });
        let capabilities = match show_result {
            Ok(info) => ModelCapabilities::Known(info.capabilities),
            Err(_) => ModelCapabilities::Unavailable,
        };
        inspections.push((model_name, capabilities));
    }

    Ok(build_catalog_from_inspections(inspections))
}

pub fn generate_embedding(model: &str, input: &str) -> Result<Vec<f32>> {
    let client = BlockingOllamaEmbeddingClient::new()?;
    client.generate_embedding(model, input)
}

impl BlockingOllamaEmbeddingClient {
    pub fn new() -> Result<Self> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("Failed to create async runtime for Ollama embeddings")?;

        Ok(Self {
            runtime,
            ollama: Ollama::default(),
        })
    }

    pub fn generate_embedding(&self, model: &str, input: &str) -> Result<Vec<f32>> {
        let model = model.trim();
        if model.is_empty() {
            return Err(anyhow!("Embedding model must be provided"));
        }

        let request = GenerateEmbeddingsRequest::new(model.to_string(), input.to_string().into());

        let response = self
            .runtime
            .block_on(async { self.ollama.generate_embeddings(request).await })
            .context("Failed to generate embeddings with Ollama")?;

        let mut embeddings = response.embeddings.into_iter();
        let embedding = embeddings
            .next()
            .ok_or_else(|| anyhow!("Ollama returned an empty embeddings list"))?;
        if embedding.is_empty() {
            return Err(anyhow!(
                "Ollama returned an embedding with zero dimensions for model '{}'",
                model
            ));
        }

        Ok(embedding)
    }
}

fn build_catalog_from_inspections(
    inspections: Vec<(String, ModelCapabilities)>,
) -> OllamaModelCatalog {
    let mut completion_models = BTreeSet::new();
    let mut embedding_models = BTreeSet::new();

    for (model_name, capabilities) in inspections {
        match capabilities {
            ModelCapabilities::Unavailable => {
                completion_models.insert(model_name);
            }
            ModelCapabilities::Known(capabilities) => {
                if capabilities.is_empty() {
                    completion_models.insert(model_name);
                    continue;
                }

                let (has_completion, has_embedding) = classify_capabilities(&capabilities);
                if has_completion {
                    completion_models.insert(model_name.clone());
                }
                if has_embedding {
                    embedding_models.insert(model_name);
                }
            }
        }
    }

    OllamaModelCatalog {
        completion_models: completion_models.into_iter().collect(),
        embedding_models: embedding_models.into_iter().collect(),
    }
}

fn classify_capabilities(capabilities: &[String]) -> (bool, bool) {
    let mut has_completion = false;
    let mut has_embedding = false;

    for capability in capabilities {
        match capability.trim().to_ascii_lowercase().as_str() {
            "completion" => has_completion = true,
            "embedding" => has_embedding = true,
            _ => {}
        }
    }

    (has_completion, has_embedding)
}

#[cfg(test)]
mod tests {
    use super::{build_catalog_from_inspections, ModelCapabilities, OllamaModelCatalog};

    #[test]
    fn classifies_models_by_capability() {
        let catalog = build_catalog_from_inspections(vec![
            (
                "completion-only".to_string(),
                ModelCapabilities::Known(vec!["completion".to_string()]),
            ),
            (
                "embedding-only".to_string(),
                ModelCapabilities::Known(vec!["embedding".to_string()]),
            ),
            (
                "both".to_string(),
                ModelCapabilities::Known(vec!["completion".to_string(), "embedding".to_string()]),
            ),
        ]);

        assert_eq!(
            catalog,
            OllamaModelCatalog {
                completion_models: vec!["both".to_string(), "completion-only".to_string()],
                embedding_models: vec!["both".to_string(), "embedding-only".to_string()],
            }
        );
    }

    #[test]
    fn falls_back_to_completion_when_show_fails_or_capabilities_are_empty() {
        let catalog = build_catalog_from_inspections(vec![
            ("show-failed".to_string(), ModelCapabilities::Unavailable),
            (
                "empty-capabilities".to_string(),
                ModelCapabilities::Known(vec![]),
            ),
        ]);

        assert_eq!(
            catalog,
            OllamaModelCatalog {
                completion_models: vec![
                    "empty-capabilities".to_string(),
                    "show-failed".to_string()
                ],
                embedding_models: vec![],
            }
        );
    }

    #[test]
    fn deduplicates_and_sorts_model_names() {
        let catalog = build_catalog_from_inspections(vec![
            (
                "z-model".to_string(),
                ModelCapabilities::Known(vec!["completion".to_string()]),
            ),
            (
                "a-model".to_string(),
                ModelCapabilities::Known(vec!["completion".to_string(), "embedding".to_string()]),
            ),
            (
                "a-model".to_string(),
                ModelCapabilities::Known(vec!["completion".to_string()]),
            ),
            (
                "embed-only".to_string(),
                ModelCapabilities::Known(vec!["embedding".to_string()]),
            ),
        ]);

        assert_eq!(
            catalog,
            OllamaModelCatalog {
                completion_models: vec!["a-model".to_string(), "z-model".to_string()],
                embedding_models: vec!["a-model".to_string(), "embed-only".to_string()],
            }
        );
    }
}
