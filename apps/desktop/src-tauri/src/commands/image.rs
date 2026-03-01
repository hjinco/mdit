#[tauri::command]
pub fn get_image_properties(path: String) -> Result<image_processing::ImageProperties, String> {
    image_processing::get_image_properties(&path)
}

#[tauri::command]
pub async fn edit_image(
    input_path: String,
    options: image_processing::ImageEditOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || image_processing::edit_image(&input_path, options))
        .await
        .map_err(|error| error.to_string())?
}
