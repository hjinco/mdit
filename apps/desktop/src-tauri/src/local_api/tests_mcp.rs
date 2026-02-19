use std::{fs, path::Path};

use rmcp::{model::CallToolRequestParams, transport::StreamableHttpClientTransport, ServiceExt};
use serde_json::json;

use super::{
    router::{build_mcp_only_router, LocalApiState},
    test_support::Harness,
};

#[tokio::test]
async fn mcp_tools_list_and_create_note_conflict_flow() {
    let harness = Harness::new("local-api-mcp-flow");
    let app = mcp_app(&harness);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind test listener");
    let addr = listener
        .local_addr()
        .expect("listener should have an address");

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    let transport = StreamableHttpClientTransport::from_uri(format!("http://{addr}/mcp"));
    let client = ().serve(transport).await.expect("failed to connect to MCP server");

    let tools = client
        .list_all_tools()
        .await
        .expect("failed to list tools from MCP server");

    assert!(tools.iter().any(|tool| tool.name == "list_vaults"));
    assert!(tools.iter().any(|tool| tool.name == "create_note"));
    assert!(tools.iter().any(|tool| tool.name == "search_notes"));

    client
        .call_tool(CallToolRequestParams {
            meta: None,
            name: "create_note".into(),
            arguments: json!({
                "vaultId": harness.vault_id,
                "title": "Mcp Note",
                "content": "# from mcp"
            })
            .as_object()
            .cloned(),
            task: None,
        })
        .await
        .expect("first create_note call should succeed");

    let created_file = harness.workspace_path.join("Mcp Note.md");
    assert!(created_file.is_file());

    let conflict = client
        .call_tool(CallToolRequestParams {
            meta: None,
            name: "create_note".into(),
            arguments: json!({
                "vaultId": harness.vault_id,
                "title": "Mcp Note"
            })
            .as_object()
            .cloned(),
            task: None,
        })
        .await
        .expect_err("duplicate create_note call should fail");

    let rmcp::service::ServiceError::McpError(conflict) = conflict else {
        panic!("expected MCP error, got different service error variant");
    };

    assert_eq!(
        conflict
            .data
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(|value| value.as_str()),
        Some("NOTE_ALREADY_EXISTS")
    );

    let _ = client.cancel().await;
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;
}

#[tokio::test]
async fn mcp_search_notes_returns_results_and_maps_invalid_input() {
    let harness = Harness::new("local-api-mcp-search");
    seed_search_fixture(&harness);
    let app = mcp_app(&harness);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind test listener");
    let addr = listener
        .local_addr()
        .expect("listener should have an address");

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    let transport = StreamableHttpClientTransport::from_uri(format!("http://{addr}/mcp"));
    let client = ().serve(transport).await.expect("failed to connect to MCP server");

    let result = client
        .call_tool(CallToolRequestParams {
            meta: None,
            name: "search_notes".into(),
            arguments: json!({
                "vaultId": harness.vault_id,
                "query": "nebula",
                "limit": 1
            })
            .as_object()
            .cloned(),
            task: None,
        })
        .await
        .expect("search_notes call should succeed");

    let structured = result
        .structured_content
        .expect("search_notes should return structured content");
    let results = structured
        .get("results")
        .and_then(|value| value.as_array())
        .expect("results should be an array");
    assert_eq!(results.len(), 1);
    assert!(results[0]
        .get("path")
        .and_then(|value| value.as_str())
        .expect("path should be string")
        .ends_with(".md"));

    let invalid = client
        .call_tool(CallToolRequestParams {
            meta: None,
            name: "search_notes".into(),
            arguments: json!({
                "vaultId": harness.vault_id,
                "query": "   "
            })
            .as_object()
            .cloned(),
            task: None,
        })
        .await
        .expect_err("empty query should fail");

    let rmcp::service::ServiceError::McpError(invalid) = invalid else {
        panic!("expected MCP error, got different service error variant");
    };

    assert_eq!(
        invalid
            .data
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(|value| value.as_str()),
        Some("INVALID_SEARCH_QUERY")
    );

    let _ = client.cancel().await;
    let _ = shutdown_tx.send(());
    let _ = server_handle.await;
}

fn mcp_app(harness: &Harness) -> axum::Router {
    build_mcp_only_router(LocalApiState {
        db_path: harness.db_path.clone(),
    })
}

fn seed_search_fixture(harness: &Harness) {
    fs::write(
        harness.workspace_path.join("Nebula One.md"),
        build_search_content("nebula"),
    )
    .expect("failed to write Nebula One.md");
    fs::write(
        harness.workspace_path.join("Nebula Two.md"),
        build_search_content("nebula"),
    )
    .expect("failed to write Nebula Two.md");

    indexing_core::index_workspace(
        Path::new(&harness.workspace_path),
        Path::new(&harness.db_path),
        "",
        "",
        false,
    )
    .expect("failed to index workspace");
}

fn build_search_content(query: &str) -> String {
    format!(
        "# Search Fixture\n\n{query}\n\n{}\n",
        "lorem ipsum ".repeat(40)
    )
}
