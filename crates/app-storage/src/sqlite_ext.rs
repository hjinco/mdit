use std::sync::OnceLock;

use anyhow::{anyhow, Result};
use rusqlite::ffi::{sqlite3_auto_extension, SQLITE_OK};
use sqlite_vec::sqlite3_vec_init;

pub fn register_auto_extension() -> Result<()> {
    static INIT: OnceLock<Result<(), String>> = OnceLock::new();

    let result = INIT.get_or_init(|| unsafe {
        let rc = sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        if rc == SQLITE_OK {
            Ok(())
        } else {
            Err(format!(
                "Failed to register sqlite-vec auto extension (sqlite rc={})",
                rc
            ))
        }
    });

    match result {
        Ok(()) => Ok(()),
        Err(message) => Err(anyhow!(message.clone())),
    }
}
