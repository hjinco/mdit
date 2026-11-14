#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowButton, NSWindowCollectionBehavior};
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::sync::{mpsc, LazyLock, Mutex};

const WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
const WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE: u64 = 1 << 1;
const WINDOW_COLLECTION_BEHAVIOR_MANAGED: u64 = 1 << 2;
const WINDOW_COLLECTION_BEHAVIOR_TRANSIENT: u64 = 1 << 3;

fn apply_pinned_space_behavior_bits(current_behavior_bits: u64) -> u64 {
    let mut next_behavior_bits = current_behavior_bits;
    next_behavior_bits &= !(WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE
        | WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
        | WINDOW_COLLECTION_BEHAVIOR_TRANSIENT);
    next_behavior_bits |= WINDOW_COLLECTION_BEHAVIOR_MANAGED;
    next_behavior_bits
}

fn remember_original_behavior_bits(
    original_behavior_by_window_label: &mut HashMap<String, u64>,
    window_label: &str,
    current_behavior_bits: u64,
) {
    original_behavior_by_window_label
        .entry(window_label.to_string())
        .or_insert(current_behavior_bits);
}

fn take_original_behavior_bits(
    original_behavior_by_window_label: &mut HashMap<String, u64>,
    window_label: &str,
) -> Option<u64> {
    original_behavior_by_window_label.remove(window_label)
}

#[cfg(target_os = "macos")]
static ORIGINAL_PINNED_WINDOW_BEHAVIOR_BY_LABEL: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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

#[tauri::command]
pub fn set_macos_pinned_window_space_behavior(
    window: tauri::WebviewWindow,
    pinned: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window_label = window.label().to_string();
        let main_thread_window = window.clone();
        let (tx, rx) = mpsc::channel();

        main_thread_window
            .run_on_main_thread(move || {
                let result = (|| -> Result<(), String> {
                    let ns_window_ptr = window.ns_window().map_err(|error| error.to_string())?;

                    // SAFETY: `ns_window_ptr` is provided by Tauri for this live window.
                    let ns_window = unsafe { &*ns_window_ptr.cast::<NSWindow>() };

                    let mut original_behavior_by_window_label =
                        ORIGINAL_PINNED_WINDOW_BEHAVIOR_BY_LABEL
                            .lock()
                            .map_err(|_| {
                                "Failed to lock pinned window behavior state".to_string()
                            })?;

                    if pinned {
                        let current_behavior_bits = ns_window.collectionBehavior().0 as u64;
                        remember_original_behavior_bits(
                            &mut original_behavior_by_window_label,
                            &window_label,
                            current_behavior_bits,
                        );

                        let pinned_behavior_bits =
                            apply_pinned_space_behavior_bits(current_behavior_bits);
                        let pinned_behavior =
                            NSWindowCollectionBehavior::from_bits_retain(pinned_behavior_bits as _);
                        ns_window.setCollectionBehavior(pinned_behavior);
                    } else if let Some(original_behavior_bits) = take_original_behavior_bits(
                        &mut original_behavior_by_window_label,
                        &window_label,
                    ) {
                        let original_behavior = NSWindowCollectionBehavior::from_bits_retain(
                            original_behavior_bits as _,
                        );
                        ns_window.setCollectionBehavior(original_behavior);
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
        let _ = (window, pinned);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_pinned_space_behavior_bits, remember_original_behavior_bits,
        take_original_behavior_bits, WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES,
        WINDOW_COLLECTION_BEHAVIOR_MANAGED, WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE,
        WINDOW_COLLECTION_BEHAVIOR_TRANSIENT,
    };
    use std::collections::HashMap;

    #[test]
    fn apply_pinned_behavior_bits_removes_space_tracking_flags() {
        let custom_flag = 1 << 10;
        let initial_behavior_bits = WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE
            | WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
            | WINDOW_COLLECTION_BEHAVIOR_TRANSIENT
            | custom_flag;

        let pinned_behavior_bits = apply_pinned_space_behavior_bits(initial_behavior_bits);

        assert_eq!(
            pinned_behavior_bits & WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE,
            0
        );
        assert_eq!(
            pinned_behavior_bits & WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES,
            0
        );
        assert_eq!(
            pinned_behavior_bits & WINDOW_COLLECTION_BEHAVIOR_TRANSIENT,
            0
        );
        assert_ne!(pinned_behavior_bits & WINDOW_COLLECTION_BEHAVIOR_MANAGED, 0);
        assert_ne!(pinned_behavior_bits & custom_flag, 0);
    }

    #[test]
    fn pin_then_unpin_restores_original_behavior_bits() {
        let mut original_behavior_by_window_label = HashMap::<String, u64>::new();
        let window_label = "quick-note-1";
        let initial_behavior_bits = WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE
            | WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
            | (1 << 8);

        remember_original_behavior_bits(
            &mut original_behavior_by_window_label,
            window_label,
            initial_behavior_bits,
        );
        let _ = apply_pinned_space_behavior_bits(initial_behavior_bits);

        let restored_behavior_bits =
            take_original_behavior_bits(&mut original_behavior_by_window_label, window_label);

        assert_eq!(restored_behavior_bits, Some(initial_behavior_bits));
        assert_eq!(
            take_original_behavior_bits(&mut original_behavior_by_window_label, window_label),
            None
        );
    }

    #[test]
    fn repeated_pin_keeps_first_original_behavior_snapshot() {
        let mut original_behavior_by_window_label = HashMap::<String, u64>::new();
        let window_label = "edit-0";
        let first_behavior_bits = WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE | (1 << 11);
        let second_behavior_bits = WINDOW_COLLECTION_BEHAVIOR_MANAGED | (1 << 12);

        remember_original_behavior_bits(
            &mut original_behavior_by_window_label,
            window_label,
            first_behavior_bits,
        );
        remember_original_behavior_bits(
            &mut original_behavior_by_window_label,
            window_label,
            second_behavior_bits,
        );

        let restored_behavior_bits =
            take_original_behavior_bits(&mut original_behavior_by_window_label, window_label);
        assert_eq!(restored_behavior_bits, Some(first_behavior_bits));
    }
}
