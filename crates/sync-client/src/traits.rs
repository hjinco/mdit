use async_trait::async_trait;

use crate::{
    error::SyncClientError,
    types::{
        CreateRemoteCommitInput, CreateRemoteCommitResult, CreateRemoteVaultResult,
        RemoteBlobEnvelope, RemoteCommitRecord, RemoteContext, SyncProgressEvent, SyncRemoteHead,
        UploadRemoteBlobInput, UploadRemoteBlobResult,
    },
};

#[async_trait]
pub trait SyncRemoteClient {
    async fn create_vault(
        &self,
        context: &RemoteContext,
        vault_id: &str,
        current_key_version: Option<i64>,
    ) -> Result<CreateRemoteVaultResult, SyncClientError>;

    async fn get_head(
        &self,
        context: &RemoteContext,
        vault_id: &str,
    ) -> Result<SyncRemoteHead, SyncClientError>;

    async fn upload_blob(
        &self,
        context: &RemoteContext,
        vault_id: &str,
        input: UploadRemoteBlobInput,
    ) -> Result<UploadRemoteBlobResult, SyncClientError>;

    async fn get_blob(
        &self,
        context: &RemoteContext,
        vault_id: &str,
        blob_id: &str,
    ) -> Result<RemoteBlobEnvelope, SyncClientError>;

    async fn create_commit(
        &self,
        context: &RemoteContext,
        vault_id: &str,
        input: CreateRemoteCommitInput,
    ) -> Result<CreateRemoteCommitResult, SyncClientError>;

    async fn get_commit(
        &self,
        context: &RemoteContext,
        vault_id: &str,
        commit_id: &str,
    ) -> Result<RemoteCommitRecord, SyncClientError>;
}

pub trait SyncProgressSink {
    fn emit(&self, event: SyncProgressEvent) -> Result<(), SyncClientError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct NoopProgressSink;

impl SyncProgressSink for NoopProgressSink {
    fn emit(&self, _event: SyncProgressEvent) -> Result<(), SyncClientError> {
        Ok(())
    }
}
