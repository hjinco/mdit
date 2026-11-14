use gpui::{App, Global, MenuItem, actions};
use gpui_updater_core::{DriverEvent, DriverEvents, UpdateDriver};
use gpui_updater_sparkle::{SparkleDriver, SparkleOptions};

actions!(mdit, [CheckForUpdates]);

struct Updater(SparkleDriver);

impl Global for Updater {}

/// Sparkle owns the download, verification, installation and relaunch UI.
/// Its main-thread objects live in GPUI's app globals for the app's lifetime.
pub fn init(cx: &mut App) -> Result<Option<MenuItem>, String> {
    let Some(mut driver) = SparkleDriver::load(SparkleOptions::new())
        .map_err(|error| format!("Updates unavailable: {error}"))?
    else {
        // An unbundled `cargo run` never checks the production update feed.
        return Ok(None);
    };

    driver.start(DriverEvents::new(|event| {
        if let DriverEvent::Failed(error) = event {
            eprintln!("Update failed: {error:?}");
        }
    }));
    // Info.plist supplies first-run defaults. Do not reset a user's persisted
    // automatic-check preference on every launch.
    if driver.automatically_checks_for_updates() == Some(true) {
        driver.check_in_background();
    }
    cx.set_global(Updater(driver));
    cx.on_action(|_: &CheckForUpdates, cx| {
        let updater = &mut cx.global_mut::<Updater>().0;
        if updater.can_check_for_updates() {
            updater.check();
        }
    });
    Ok(Some(MenuItem::action(
        "Check for Updates…",
        CheckForUpdates,
    )))
}
