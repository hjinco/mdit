#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowButton};
#[cfg(target_os = "macos")]
use std::sync::mpsc;

#[tauri::command]
pub fn set_macos_traffic_lights_hidden(
    window: tauri::WebviewWindow,
    hidden: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let main_thread_window = window.clone();
        let (tx, rx) = mpsc::channel();

        main_thread_window
            .run_on_main_thread(move || {
                let result = (|| -> Result<(), String> {
                    let ns_window_ptr = window.ns_window().map_err(|error| error.to_string())?;

                    // SAFETY: `ns_window_ptr` is provided by Tauri for this live window.
                    let ns_window = unsafe { &*ns_window_ptr.cast::<NSWindow>() };

                    for button_kind in [
                        NSWindowButton::CloseButton,
                        NSWindowButton::MiniaturizeButton,
                        NSWindowButton::ZoomButton,
                    ] {
                        let button =
                            ns_window.standardWindowButton(button_kind).ok_or_else(|| {
                                format!("Failed to get macOS window button: {button_kind:?}")
                            })?;
                        button.setHidden(hidden);
                    }

                    Ok(())
                })();

                let _ = tx.send(result);
            })
            .map_err(|error| error.to_string())?;

        rx.recv().map_err(|error| error.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, hidden);
        Ok(())
    }
}
