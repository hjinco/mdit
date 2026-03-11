use sync_client::{SyncClientError, SyncProgressEvent, SyncProgressSink};

#[derive(Debug, Default, Clone, Copy)]
pub struct JsonLineProgressSink;

impl SyncProgressSink for JsonLineProgressSink {
    fn emit(&self, event: SyncProgressEvent) -> Result<(), SyncClientError> {
        let serialized = serde_json::to_string(&event)
            .map_err(|error| SyncClientError::local(error.to_string()))?;
        println!("{serialized}");
        Ok(())
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct StderrProgressSink;

impl SyncProgressSink for StderrProgressSink {
    fn emit(&self, event: SyncProgressEvent) -> Result<(), SyncClientError> {
        let completed = event
            .completed
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string());
        let total = event
            .total
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string());

        eprintln!(
            "[sync {:?} {:?}] {} ({completed}/{total})",
            event.direction, event.phase, event.workspace_path
        );
        Ok(())
    }
}
