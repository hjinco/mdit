mod codec;

use std::{collections::HashMap, fs, path::Path};

use anyhow::{Context, Result};
use base64::Engine;

use crate::{
    constants::{BLOB_KIND_FILE, BLOB_KIND_MANIFEST},
    manifest::finalize_manifest_blob_ids,
    scan::scan_workspace,
    store::SyncWorkspaceStore,
    types::{
        DecryptFileBlobInput, DecryptManifestBlobInput, DecryptedFileBlob, LocalSyncManifest,
        PreparedSyncWorkspaceResult, ScanOptions, ScanWorkspaceResult,
    },
    util::workspace_absolute_path,
};

use self::codec::{decode_vault_key, decrypt_blob_plaintext, encrypt_blob};

pub fn prepare_encrypted_workspace(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    vault_key_hex: &str,
    options: ScanOptions,
) -> Result<PreparedSyncWorkspaceResult> {
    let scan_result = scan_workspace(workspace_root, store, options)?;
    let vault_key = decode_vault_key(vault_key_hex)?;
    build_encrypted_workspace_result(workspace_root, &scan_result, &vault_key)
}

pub fn decrypt_manifest_blob(input: DecryptManifestBlobInput) -> Result<LocalSyncManifest> {
    if input.kind != BLOB_KIND_MANIFEST {
        return Err(anyhow::anyhow!(
            "Only manifest blobs can be decrypted by this helper"
        ));
    }

    let vault_key = decode_vault_key(&input.vault_key_hex)?;
    let plaintext = decrypt_blob_plaintext(
        input.vault_id,
        &input.kind,
        &vault_key,
        &input.ciphertext_base64,
        &input.nonce_base64,
    )?;
    serde_json::from_slice(&plaintext).context("Failed to deserialize decrypted manifest")
}

pub fn decrypt_file_blob(input: DecryptFileBlobInput) -> Result<DecryptedFileBlob> {
    if input.kind != BLOB_KIND_FILE {
        return Err(anyhow::anyhow!(
            "Only file blobs can be decrypted by this helper"
        ));
    }

    let vault_key = decode_vault_key(&input.vault_key_hex)?;
    let plaintext = decrypt_blob_plaintext(
        input.vault_id,
        &input.kind,
        &vault_key,
        &input.ciphertext_base64,
        &input.nonce_base64,
    )?;

    Ok(DecryptedFileBlob {
        plaintext_base64: base64::engine::general_purpose::STANDARD.encode(&plaintext),
        plaintext_size: plaintext.len() as u64,
    })
}

fn build_encrypted_workspace_result(
    workspace_root: &Path,
    scan_result: &ScanWorkspaceResult,
    vault_key: &[u8; codec::LOCAL_SYNC_VAULT_KEY_LEN],
) -> Result<PreparedSyncWorkspaceResult> {
    let mut file_blobs = Vec::new();
    let mut blob_ids_by_entry_id = HashMap::new();

    for entry in &scan_result.entries {
        if entry.kind != BLOB_KIND_FILE {
            continue;
        }

        let absolute_path = workspace_absolute_path(workspace_root, &entry.local_path)?;
        let plaintext = fs::read(&absolute_path).with_context(|| {
            format!(
                "Failed to read file while preparing encrypted sync blob: {}",
                absolute_path.display()
            )
        })?;
        let prepared_blob = encrypt_blob(
            scan_result.sync_vault_state.vault_id,
            BLOB_KIND_FILE,
            vault_key,
            &plaintext,
            Some(entry.entry_id.clone()),
            entry.last_known_content_hash.clone(),
        )?;
        blob_ids_by_entry_id.insert(entry.entry_id.clone(), prepared_blob.blob_id.clone());
        file_blobs.push(prepared_blob);
    }

    file_blobs.sort_by(|left, right| {
        left.entry_id
            .as_deref()
            .unwrap_or("")
            .cmp(right.entry_id.as_deref().unwrap_or(""))
    });

    let final_manifest = finalize_manifest_blob_ids(&scan_result.manifest, &blob_ids_by_entry_id);
    let manifest_plaintext =
        serde_json::to_vec(&final_manifest).context("Failed to serialize local sync manifest")?;
    let manifest_blob = encrypt_blob(
        scan_result.sync_vault_state.vault_id,
        BLOB_KIND_MANIFEST,
        vault_key,
        &manifest_plaintext,
        None,
        None,
    )?;

    Ok(PreparedSyncWorkspaceResult {
        sync_vault_state: scan_result.sync_vault_state.clone(),
        entries: scan_result.entries.clone(),
        exclusion_events: scan_result.exclusion_events.clone(),
        manifest: final_manifest,
        file_blobs,
        manifest_blob,
        files_scanned: scan_result.files_scanned,
        directories_scanned: scan_result.directories_scanned,
        entries_deleted: scan_result.entries_deleted,
    })
}
