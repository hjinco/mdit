use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, GenericImageView, ImageEncoder, ImageFormat};
use serde::{Deserialize, Serialize};
use std::path::Path;
use webp::{Encoder, WebPMemory};

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageProperties {
    pub width: u32,
    pub height: u32,
    pub format: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default)]
    pub maintain_aspect_ratio: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEditOptions {
    pub resize: Option<ResizeOptions>,
    pub format: Option<String>, // "jpeg", "png", "webp", "avif"
    pub quality: Option<u8>,    // 0-100, for JPEG and WebP
    pub output_path: Option<String>,
}

/// Gets image properties (dimensions and format) from an image file
pub fn get_image_properties(path: &str) -> Result<ImageProperties, String> {
    let img_path = Path::new(path);
    
    // Open and decode the image
    let img = image::open(img_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Get dimensions
    let (width, height) = img.dimensions();
    
    // Detect format from file extension
    let format = img_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());
    
    Ok(ImageProperties {
        width,
        height,
        format,
    })
}

/// Edits an image according to the provided options
pub fn edit_image(input_path: &str, options: ImageEditOptions) -> Result<String, String> {
    let input_path_buf = Path::new(input_path);
    
    // Open the image
    let mut img = image::open(input_path_buf)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Apply resize if specified
    if let Some(resize_opts) = options.resize {
        let (width, height) = img.dimensions();
        let target_width = resize_opts.width;
        let target_height = resize_opts.height;
        
        // If only one dimension is specified, always maintain aspect ratio
        let maintain_ratio = resize_opts.maintain_aspect_ratio 
            || target_width.is_none() 
            || target_height.is_none();
        
        if let (Some(w), Some(h)) = (target_width, target_height) {
            if maintain_ratio {
                // Maintain aspect ratio - use resize() which fits within bounds while preserving aspect ratio
                if w != width || h != height {
                    img = img.resize(w, h, FilterType::Lanczos3);
                }
            } else {
                // Exact dimensions - use resize_exact()
                if w != width || h != height {
                    img = img.resize_exact(w, h, FilterType::Lanczos3);
                }
            }
        } else if let Some(w) = target_width {
            // Only width specified - calculate height based on aspect ratio
            if w != width {
                let aspect_ratio = height as f64 / width as f64;
                let calculated_height = (w as f64 * aspect_ratio).round() as u32;
                img = img.resize_exact(w, calculated_height, FilterType::Lanczos3);
            }
        } else if let Some(h) = target_height {
            // Only height specified - calculate width based on aspect ratio
            if h != height {
                let aspect_ratio = width as f64 / height as f64;
                let calculated_width = (h as f64 * aspect_ratio).round() as u32;
                img = img.resize_exact(calculated_width, h, FilterType::Lanczos3);
            }
        }
    }
    
    // Determine output path
    let output_path = options.output_path.as_deref().unwrap_or(input_path);
    let output_path_buf = Path::new(output_path);
    
    // Determine output format
    let output_format = if let Some(format_str) = options.format {
        // Format specified in options
        match format_str.to_lowercase().as_str() {
            "jpeg" | "jpg" => ImageFormat::Jpeg,
            "png" => ImageFormat::Png,
            "webp" => ImageFormat::WebP,
            "avif" => ImageFormat::Avif,
            _ => {
                // Try to detect from output file extension
                detect_format_from_path(output_path_buf)
            }
        }
    } else if options.quality.is_some() {
        // If quality is specified but no format, try to detect from output path or default to JPEG
        let detected = detect_format_from_path(output_path_buf);
        if detected == ImageFormat::WebP {
            ImageFormat::WebP
        } else {
            ImageFormat::Jpeg
        }
    } else {
        // No format specified, detect from output file extension
        detect_format_from_path(output_path_buf)
    };
    
    // Save the image
    if output_format == ImageFormat::Jpeg && options.quality.is_some() {
        // Use custom JPEG quality
        let quality = options.quality.unwrap();
        let file = std::fs::File::create(output_path_buf)
            .map_err(|e| format!("Failed to create output file: {}", e))?;
        
        let rgb_img = img.to_rgb8();
        let encoder = JpegEncoder::new_with_quality(&file, quality);
        encoder
            .write_image(
                rgb_img.as_raw(),
                rgb_img.width(),
                rgb_img.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
    } else if output_format == ImageFormat::WebP && options.quality.is_some() {
        // Use custom WebP quality with webp crate for lossy encoding
        let quality = options.quality.unwrap();
        let rgb_img = img.to_rgb8();
        
        // Convert quality from 0-100 to 0.0-100.0 for webp crate
        let quality_f32 = quality as f32;
        
        // Encode with webp crate
        let encoder: Encoder = Encoder::from_rgb(rgb_img.as_raw(), rgb_img.width(), rgb_img.height());
        let webp: WebPMemory = encoder.encode(quality_f32);
        
        // Write to file (WebPMemory implements Deref to &[u8])
        std::fs::write(output_path_buf, &*webp)
            .map_err(|e| format!("Failed to write WebP file: {}", e))?;
    } else {
        // Use save_with_format to ensure correct format is used
        // (especially when format is specified but doesn't match extension)
        img.save_with_format(output_path_buf, output_format)
            .map_err(|e| format!("Failed to save image: {}", e))?;
    }
    
    Ok(output_path.to_string())
}

/// Detects image format from file path extension
fn detect_format_from_path(path: &Path) -> ImageFormat {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| match ext.to_lowercase().as_str() {
            "jpg" | "jpeg" => ImageFormat::Jpeg,
            "png" => ImageFormat::Png,
            "webp" => ImageFormat::WebP,
            "avif" => ImageFormat::Avif,
            _ => ImageFormat::Png, // Default to PNG
        })
        .unwrap_or(ImageFormat::Png)
}

