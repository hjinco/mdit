use anyhow::{Context, Result};
use base64::Engine;
use chacha20poly1305::{
    aead::{Aead, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use rand::RngCore;
use serde::Serialize;

use crate::types::PreparedSyncBlob;

pub(crate) const LOCAL_SYNC_CIPHERTEXT_SCHEMA_VERSION: u32 = 1;
pub(crate) const LOCAL_SYNC_VAULT_KEY_LEN: usize = 32;
const XCHACHA20_NONCE_LEN: usize = 24;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlobAad<'a> {
    schema_version: u32,
    vault_id: i64,
    kind: &'a str,
}

pub(crate) fn decode_vault_key(vault_key_hex: &str) -> Result<[u8; LOCAL_SYNC_VAULT_KEY_LEN]> {
    let bytes = hex::decode(vault_key_hex).context("Vault key must be valid hex")?;
    let vault_key: [u8; LOCAL_SYNC_VAULT_KEY_LEN] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("Vault key must be 32 bytes"))?;
    Ok(vault_key)
}

pub(crate) fn encrypt_blob(
    vault_id: i64,
    kind: &str,
    vault_key: &[u8; LOCAL_SYNC_VAULT_KEY_LEN],
    plaintext: &[u8],
    entry_id: Option<String>,
    content_hash: Option<String>,
) -> Result<PreparedSyncBlob> {
    let cipher = XChaCha20Poly1305::new_from_slice(vault_key)
        .map_err(|_| anyhow::anyhow!("Failed to initialize sync cipher with vault key"))?;
    let aad = serde_json::to_vec(&BlobAad {
        schema_version: LOCAL_SYNC_CIPHERTEXT_SCHEMA_VERSION,
        vault_id,
        kind,
    })
    .context("Failed to serialize sync blob AAD")?;

    let mut nonce = [0u8; XCHACHA20_NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let nonce_value = XNonce::from(nonce);

    let ciphertext = cipher
        .encrypt(
            &nonce_value,
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .map_err(|_| anyhow::anyhow!("Failed to encrypt {kind} sync blob"))?;

    let ciphertext_hash = blake3::hash(&ciphertext).to_hex().to_string();
    Ok(PreparedSyncBlob {
        kind: kind.to_string(),
        blob_id: ciphertext_hash.clone(),
        ciphertext_hash,
        ciphertext_base64: base64::engine::general_purpose::STANDARD.encode(&ciphertext),
        nonce_base64: base64::engine::general_purpose::STANDARD.encode(nonce),
        ciphertext_size: ciphertext.len() as u64,
        plaintext_size: plaintext.len() as u64,
        entry_id,
        content_hash,
    })
}

pub(crate) fn decrypt_blob_plaintext(
    vault_id: i64,
    kind: &str,
    vault_key: &[u8; LOCAL_SYNC_VAULT_KEY_LEN],
    ciphertext_base64: &str,
    nonce_base64: &str,
) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new_from_slice(vault_key)
        .map_err(|_| anyhow::anyhow!("Failed to initialize sync cipher with vault key"))?;
    let aad = serde_json::to_vec(&BlobAad {
        schema_version: LOCAL_SYNC_CIPHERTEXT_SCHEMA_VERSION,
        vault_id,
        kind,
    })
    .context("Failed to serialize sync blob AAD")?;

    let nonce_bytes = base64::engine::general_purpose::STANDARD
        .decode(nonce_base64)
        .context("Failed to decode blob nonce")?;
    let nonce_bytes: [u8; XCHACHA20_NONCE_LEN] = nonce_bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("Invalid nonce length"))?;
    let nonce = XNonce::from(nonce_bytes);
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_base64)
        .context("Failed to decode blob ciphertext")?;

    cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &ciphertext,
                aad: &aad,
            },
        )
        .map_err(|_| anyhow::anyhow!("Failed to decrypt sync blob"))
}
