use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::Engine;

use crate::{
    error::SyncClientError,
    traits::SyncProgressSink,
    types::{RemoteBlobEnvelope, RemoteContext, SyncDirection, SyncPhase, SyncProgressEvent},
};

pub fn build_remote_context(
    server_url: String,
    auth_token: String,
    user_id: String,
) -> RemoteContext {
    RemoteContext {
        server_url,
        auth_token,
        user_id,
    }
}

pub fn emit_progress(
    sink: &impl SyncProgressSink,
    session_id: u64,
    workspace_root: &Path,
    direction: SyncDirection,
    phase: SyncPhase,
    completed: Option<usize>,
    total: Option<usize>,
) -> Result<(), SyncClientError> {
    sink.emit(SyncProgressEvent {
        session_id,
        workspace_path: workspace_root.to_string_lossy().into_owned(),
        direction,
        phase,
        completed,
        total,
    })
}

pub fn now_unix_ms() -> Result<i64, SyncClientError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| SyncClientError::local(error.to_string()))?;
    i64::try_from(duration.as_millis()).map_err(|error| SyncClientError::local(error.to_string()))
}

pub fn ensure_remote_blob_matches(
    actual: &RemoteBlobEnvelope,
    expected_blob_id: &str,
    expected_ciphertext_hash: &str,
) -> Result<(), SyncClientError> {
    ensure_remote_blob_envelope(actual, expected_blob_id)?;

    if actual.ciphertext_hash != expected_ciphertext_hash {
        return Err(SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob ciphertext hash mismatch: expected {expected_ciphertext_hash}, got {}",
                actual.ciphertext_hash
            ),
        ));
    }

    Ok(())
}

pub fn ensure_remote_blob_envelope(
    actual: &RemoteBlobEnvelope,
    expected_blob_id: &str,
) -> Result<(), SyncClientError> {
    if actual.blob_id != expected_blob_id {
        return Err(SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob id mismatch: expected {expected_blob_id}, got {}",
                actual.blob_id
            ),
        ));
    }

    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&actual.ciphertext_base64)
        .map_err(|error| {
            SyncClientError::remote(
                "INVALID_BLOB_RESPONSE",
                format!("remote blob ciphertext is not valid base64: {error}"),
            )
        })?;
    let computed_ciphertext_hash = blake3::hash(&ciphertext).to_hex().to_string();
    if actual.ciphertext_hash != computed_ciphertext_hash {
        return Err(SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob ciphertext hash mismatch: expected {computed_ciphertext_hash}, got {}",
                actual.ciphertext_hash
            ),
        ));
    }

    if actual.ciphertext_size != ciphertext.len() as u64 {
        return Err(SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob ciphertext size mismatch: expected {}, got {}",
                ciphertext.len(),
                actual.ciphertext_size
            ),
        ));
    }

    Ok(())
}

pub fn ensure_decrypted_file_matches_content_hash(
    plaintext_base64: &str,
    expected_content_hash: &str,
) -> Result<(), SyncClientError> {
    let plaintext = base64::engine::general_purpose::STANDARD
        .decode(plaintext_base64)
        .map_err(|error| {
            SyncClientError::remote(
                "INVALID_BLOB_RESPONSE",
                format!("decrypted file payload is not valid base64: {error}"),
            )
        })?;
    let computed_content_hash = blake3::hash(&plaintext).to_hex().to_string();
    if computed_content_hash != expected_content_hash {
        return Err(SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote file content hash mismatch: expected {expected_content_hash}, got {computed_content_hash}"
            ),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use base64::Engine;

    use super::{
        ensure_decrypted_file_matches_content_hash, ensure_remote_blob_envelope, RemoteBlobEnvelope,
    };
    use crate::SyncClientError;

    #[test]
    fn rejects_remote_blob_when_ciphertext_hash_does_not_match_payload() {
        let ciphertext = b"ciphertext";
        let error = ensure_remote_blob_envelope(
            &RemoteBlobEnvelope {
                vault_id: "vault-1".to_string(),
                blob_id: "blob-1".to_string(),
                kind: "file".to_string(),
                ciphertext_hash: "wrong-hash".to_string(),
                ciphertext_base64: base64::engine::general_purpose::STANDARD.encode(ciphertext),
                nonce_base64: "bm9uY2U=".to_string(),
                ciphertext_size: ciphertext.len() as u64,
            },
            "blob-1",
        )
        .expect_err("envelope should be rejected");

        assert_eq!(
            error,
            SyncClientError::remote(
                "INVALID_BLOB_RESPONSE",
                format!(
                    "remote blob ciphertext hash mismatch: expected {}, got wrong-hash",
                    blake3::hash(ciphertext).to_hex()
                ),
            )
        );
    }

    #[test]
    fn rejects_decrypted_file_when_plaintext_hash_does_not_match_manifest() {
        let error = ensure_decrypted_file_matches_content_hash(
            &base64::engine::general_purpose::STANDARD.encode("hello"),
            "wrong-content-hash",
        )
        .expect_err("content hash should be rejected");

        assert_eq!(
            error,
            SyncClientError::remote(
                "INVALID_BLOB_RESPONSE",
                format!(
                    "remote file content hash mismatch: expected wrong-content-hash, got {}",
                    blake3::hash(b"hello").to_hex()
                ),
            )
        );
    }
}
