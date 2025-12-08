use std::fs;
use std::path::Path;

fn copy_recursive(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    let metadata = fs::symlink_metadata(source)?;

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

    copy_recursive(source, destination).map_err(|e| format!("Failed to copy: {}", e))
}

