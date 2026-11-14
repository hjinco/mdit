#[tauri::command]
pub fn get_image_properties(
    path: String,
) -> Result<mdit_image_processing::ImageProperties, String> {
    mdit_image_processing::get_image_properties(&path)
}

#[tauri::command]
pub async fn edit_image(
    input_path: String,
    options: mdit_image_processing::ImageEditOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        mdit_image_processing::edit_image(&input_path, options)
    })
    .await
    .map_err(|error| error.to_string())?
}
