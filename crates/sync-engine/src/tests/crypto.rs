use std::fs;

use base64::Engine;

use crate::{
    decrypt_file_blob, decrypt_manifest_blob, prepare_encrypted_workspace, DecryptFileBlobInput,
    DecryptManifestBlobInput, LocalSyncManifestEntry, ScanOptions,
};

use super::harness::Harness;

#[test]
fn prepare_encrypted_workspace_builds_file_and_manifest_blobs() {
    let harness = Harness::new("mdit-sync-engine-encrypt");
    fs::create_dir_all(harness.workspace.join("notes")).expect("failed to create notes dir");
    fs::write(
        harness.workspace.join("notes/note.md"),
        b"hello encrypted world",
    )
    .expect("failed to write note");

    let prepared = prepare_encrypted_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    assert_eq!(prepared.file_blobs.len(), 1);
    assert_eq!(prepared.manifest.entries.len(), 2);
    assert_eq!(prepared.manifest_blob.kind, "manifest");
    assert!(!prepared.manifest_blob.blob_id.is_empty());

    let file_blob = &prepared.file_blobs[0];
    let manifest_file_blob_id = prepared
        .manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File { blob_id, .. } => Some(blob_id.clone()),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("manifest file entry should exist");

    assert_eq!(file_blob.blob_id, manifest_file_blob_id);
    assert_ne!(file_blob.ciphertext_base64, "hello encrypted world");

    let decrypted_manifest = decrypt_manifest_blob(DecryptManifestBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "manifest".to_string(),
        ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
        nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
    })
    .expect("manifest decrypt should succeed");
    assert_eq!(decrypted_manifest, prepared.manifest);
}

#[test]
fn decrypt_manifest_blob_round_trips_prepared_manifest() {
    let harness = Harness::new("mdit-sync-engine-decrypt-manifest");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let prepared = prepare_encrypted_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let decrypted = decrypt_manifest_blob(DecryptManifestBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "manifest".to_string(),
        ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
        nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
    })
    .expect("manifest decrypt should succeed");

    assert_eq!(decrypted, prepared.manifest);
}

#[test]
fn decrypt_file_blob_round_trips_prepared_file() {
    let harness = Harness::new("mdit-sync-engine-decrypt-file");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let prepared = prepare_encrypted_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let file_blob = prepared
        .file_blobs
        .first()
        .expect("prepared file blob should exist");
    let decrypted = decrypt_file_blob(DecryptFileBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "file".to_string(),
        ciphertext_base64: file_blob.ciphertext_base64.clone(),
        nonce_base64: file_blob.nonce_base64.clone(),
    })
    .expect("file decrypt should succeed");

    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(decrypted.plaintext_base64)
            .expect("plaintext should decode"),
        b"abc"
    );
    assert_eq!(decrypted.plaintext_size, 3);
}
