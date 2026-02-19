#[tauri::command]
pub fn get_image_properties(path: String) -> Result<image_core::ImageProperties, String> {
    image_core::get_image_properties(&path)
}

#[tauri::command]
pub async fn edit_image(
    input_path: String,
    options: image_core::ImageEditOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || image_core::edit_image(&input_path, options))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_image_properties_command(path: String) -> Result<image_core::ImageProperties, String> {
    get_image_properties(path)
}

#[tauri::command]
pub async fn edit_image_command(
    input_path: String,
    options: image_core::ImageEditOptions,
) -> Result<String, String> {
    edit_image(input_path, options).await
}
