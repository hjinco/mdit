use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, GenericImageView, ImageEncoder,
    ImageFormat,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use webp::{Encoder, WebPMemory};

#[tauri::command]
pub fn get_image_properties_command(path: String) -> Result<ImageProperties, String> {
    get_image_properties(&path)
}

#[tauri::command]
pub async fn edit_image_command(
    input_path: String,
    options: ImageEditOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || edit_image(&input_path, options))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(target_os = "macos")]
mod macos_heic {
    use core_foundation::{
        base::{CFRelease, TCFType, CFType},
        data::{CFData, CFDataRef},
        dictionary::{CFDictionary, CFDictionaryRef},
        number::CFNumber,
        string::CFString,
    };
    use core_graphics::{
        color_space::CGColorSpace,
        context::CGContext,
        geometry::{CGPoint, CGRect, CGSize},
        image::{CGImage, CGImageAlphaInfo, CGImageByteOrderInfo},
    };
    use foreign_types::ForeignType;
    use image::{DynamicImage, RgbaImage};
    use std::path::Path;

    #[repr(C)]
    struct __CGImageSource {
        _private: [u8; 0],
    }
    type CGImageSourceRef = *mut __CGImageSource;

    #[link(name = "ImageIO", kind = "framework")]
    extern "C" {
        fn CGImageSourceCreateWithData(
            data: CFDataRef,
            options: CFDictionaryRef,
        ) -> CGImageSourceRef;
        fn CGImageSourceCopyPropertiesAtIndex(
            isrc: CGImageSourceRef,
            index: usize,
            options: CFDictionaryRef,
        ) -> CFDictionaryRef;
        fn CGImageSourceCreateImageAtIndex(
            isrc: CGImageSourceRef,
            index: usize,
            options: CFDictionaryRef,
        ) -> core_graphics::sys::CGImageRef;
    }

    struct ImageSourceHandle(CGImageSourceRef);

    impl ImageSourceHandle {
        fn new(ptr: CGImageSourceRef) -> Self {
            Self(ptr)
        }

        fn as_ptr(&self) -> CGImageSourceRef {
            self.0
        }
    }

    impl Drop for ImageSourceHandle {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0 as _) };
        }
    }

    fn read_image_orientation(source: CGImageSourceRef) -> Option<u32> {
        let props_ref = unsafe { CGImageSourceCopyPropertiesAtIndex(source, 0, std::ptr::null()) };
        if props_ref.is_null() {
            return None;
        }

        let props: CFDictionary<CFType, CFType> =
            unsafe { TCFType::wrap_under_create_rule(props_ref) };

        // ImageIO's top-level properties dictionary typically uses "Orientation" for EXIF orientation.
        let key = CFString::from_static_string("Orientation").as_CFType();
        props
            .find(&key)
            .and_then(|value| value.downcast::<CFNumber>())
            .and_then(|number| number.to_i32())
            .filter(|&orientation| (1..=8).contains(&orientation))
            .map(|orientation| orientation as u32)
    }

    fn apply_orientation(img: RgbaImage, orientation: u32) -> RgbaImage {
        match orientation {
            1 => img,
            2 => image::imageops::flip_horizontal(&img),
            3 => image::imageops::rotate180(&img),
            4 => image::imageops::flip_vertical(&img),
            // 5: mirrored horizontally then rotated 270 CW (transpose)
            5 => {
                let flipped = image::imageops::flip_horizontal(&img);
                image::imageops::rotate270(&flipped)
            }
            // 6: rotated 90 CW
            6 => image::imageops::rotate90(&img),
            // 7: mirrored horizontally then rotated 90 CW (transverse)
            7 => {
                let flipped = image::imageops::flip_horizontal(&img);
                image::imageops::rotate90(&flipped)
            }
            // 8: rotated 270 CW
            8 => image::imageops::rotate270(&img),
            _ => img,
        }
    }

    pub fn decode_heic_to_rgba(path: &Path) -> Result<DynamicImage, String> {
        let data = std::fs::read(path).map_err(|e| format!("Failed to read HEIC file: {}", e))?;

        let cf_data = CFData::from_buffer(&data);
        let source_ptr =
            unsafe { CGImageSourceCreateWithData(cf_data.as_concrete_TypeRef(), std::ptr::null()) };
        if source_ptr.is_null() {
            return Err("ImageIO failed to create image source".to_string());
        }

        let source = ImageSourceHandle::new(source_ptr);
        let orientation = read_image_orientation(source.as_ptr());
        let cg_image_ref =
            unsafe { CGImageSourceCreateImageAtIndex(source.as_ptr(), 0, std::ptr::null()) };

        if cg_image_ref.is_null() {
            return Err("ImageIO failed to decode HEIC".to_string());
        }

        // from_ptr takes ownership and will release the CGImageRef when dropped.
        let cg_image = unsafe { CGImage::from_ptr(cg_image_ref) };

        let width = cg_image.width();
        let height = cg_image.height();
        if width == 0 || height == 0 {
            return Err("Decoded HEIC has zero dimensions".to_string());
        }

        let mut buf = vec![
            0u8;
            width
                .checked_mul(height)
                .and_then(|s| s.checked_mul(4))
                .ok_or_else(|| "Image dimensions are too large.".to_string())?
        ];
        let color_space = CGColorSpace::create_device_rgb();
        let bytes_per_row = width * 4;
        let bitmap_info = (CGImageAlphaInfo::CGImageAlphaPremultipliedLast as u32)
            | (CGImageByteOrderInfo::CGImageByteOrder32Big as u32);

        let context = CGContext::create_bitmap_context(
            Some(buf.as_mut_ptr() as *mut _),
            width,
            height,
            8,
            bytes_per_row,
            &color_space,
            bitmap_info,
        );

        let rect = CGRect::new(
            &CGPoint::new(0.0, 0.0),
            &CGSize::new(width as f64, height as f64),
        );
        context.draw_image(rect, &cg_image);

        let width_u32 = width
            .try_into()
            .map_err(|_| format!("Image width {} is too large and exceeds u32::MAX", width))?;
        let height_u32 = height
            .try_into()
            .map_err(|_| format!("Image height {} is too large and exceeds u32::MAX", height))?;
        let rgba = RgbaImage::from_raw(width_u32, height_u32, buf)
            .ok_or_else(|| "Failed to convert HEIC buffer to image".to_string())?;

        let rgba = match orientation {
            Some(o) => apply_orientation(rgba, o),
            None => rgba,
        };

        Ok(DynamicImage::ImageRgba8(rgba))
    }
}

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
    let img = open_image_with_heic_support(img_path)?;

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
    let mut img = open_image_with_heic_support(input_path_buf)?;

    // Apply resize if specified
    if let Some(resize_opts) = options.resize {
        let (width, height) = img.dimensions();
        let target_width = resize_opts.width;
        let target_height = resize_opts.height;

        // If only one dimension is specified, always maintain aspect ratio
        let maintain_ratio =
            resize_opts.maintain_aspect_ratio || target_width.is_none() || target_height.is_none();

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
            // Only width specified, height is auto-calculated to maintain aspect ratio
            if w != width {
                img = img.resize(w, u32::MAX, FilterType::Lanczos3);
            }
        } else if let Some(h) = target_height {
            // Only height specified, width is auto-calculated to maintain aspect ratio
            if h != height {
                img = img.resize(u32::MAX, h, FilterType::Lanczos3);
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

        // Convert quality from 0-100 to 0.0-100.0 for webp crate
        let quality_f32 = quality as f32;

        // Encode with webp crate, preserving alpha when present
        let webp_memory: WebPMemory = if img.color().has_alpha() {
            let rgba_img = img.to_rgba8();
            let encoder =
                Encoder::from_rgba(rgba_img.as_raw(), rgba_img.width(), rgba_img.height());
            encoder.encode(quality_f32)
        } else {
            let rgb_img = img.to_rgb8();
            let encoder = Encoder::from_rgb(rgb_img.as_raw(), rgb_img.width(), rgb_img.height());
            encoder.encode(quality_f32)
        };

        // Write to file (WebPMemory implements Deref to &[u8])
        std::fs::write(output_path_buf, &*webp_memory)
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

fn open_image_with_heic_support(path: &Path) -> Result<DynamicImage, String> {
    #[cfg(target_os = "macos")]
    {
        let ext = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase());

        if matches!(ext.as_deref(), Some("heic") | Some("heif") | Some("hif")) {
            match macos_heic::decode_heic_to_rgba(path) {
                Ok(img) => return Ok(img),
                Err(heic_err) => {
                    // Fall back to the standard decoder but surface the HEIC error if both fail.
                    return image::open(path).map_err(|fallback_err| {
                        format!(
                            "HEIC decode failed: {}; fallback decoder failed: {}",
                            heic_err, fallback_err
                        )
                    });
                }
            }
        }
    }

    image::open(path).map_err(|e| format!("Failed to open image: {}", e))
}
