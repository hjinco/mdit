use mdit_ollama_client::list_model_catalog;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelsResponse {
    completion_models: Vec<String>,
    embedding_models: Vec<String>,
}

#[tauri::command]
pub fn list_ollama_models_command() -> Result<OllamaModelsResponse, String> {
    let catalog = list_model_catalog().map_err(|error| error.to_string())?;
    Ok(OllamaModelsResponse {
        completion_models: catalog.completion_models,
        embedding_models: catalog.embedding_models,
    })
}
