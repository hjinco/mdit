use std::fs;
use std::path::Path;

fn delete_paths(paths: Vec<String>) -> Result<(), trash::Error> {
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};

        let mut trash_context = trash::TrashContext::new();
        trash_context.set_delete_method(DeleteMethod::NsFileManager);
        return trash_context.delete_all(paths);
    }

    #[cfg(not(target_os = "macos"))]
    {
        trash::delete_all(paths)
    }
}

fn copy_recursive(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    let metadata = fs::metadata(source)?;

    if metadata.is_dir() {
        fs::create_dir_all(destination)?;

        for entry in fs::read_dir(source)? {
            let entry = entry?;
            let entry_path = entry.path();
            let dest_path = destination.join(entry.file_name());
            copy_recursive(&entry_path, &dest_path)?;
        }
    } else {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, destination)?;
    }

    Ok(())
}

#[tauri::command]
pub fn copy(source_path: String, destination_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let destination = Path::new(&destination_path);

    copy_recursive(source, destination).map_err(|error| format!("Failed to copy: {}", error))
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    delete_paths(vec![path]).map_err(|error| format!("Failed to delete file: {}", error))
}

#[tauri::command]
pub fn move_many_to_trash(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    delete_paths(paths).map_err(|error| format!("Failed to delete files: {}", error))
}
