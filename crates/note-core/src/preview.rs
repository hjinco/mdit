use std::fs::File;
use std::io::Read;
use std::path::Path;

const PREVIEW_BYTES: usize = 500;

pub fn get_note_preview(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = vec![0u8; PREVIEW_BYTES];

    match file.read(&mut buffer) {
        Ok(bytes_read) => {
            if bytes_read == 0 {
                return Ok(String::new());
            }
            buffer.truncate(bytes_read);
            let preview = String::from_utf8_lossy(&buffer);
            Ok(format_preview_text(preview.as_ref()))
        }
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

pub fn format_preview_text(raw: &str) -> String {
    super::markdown_text::format_preview_text(raw)
}
