import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import { Switch } from "@mdit/ui/components/switch"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

const REST_APIS = [
	{
		method: "GET",
		path: "/healthz",
		description: "Health check",
	},
	{
		method: "GET",
		path: "/api/v1/vaults",
		description: "List vaults",
	},
	{
		method: "POST",
		path: "/api/v1/vaults/{vault_id}/notes",
		description: "Create markdown note",
	},
	{
		method: "POST",
		path: "/api/v1/vaults/{vault_id}/search",
		description: "Search notes",
	},
] as const

const MCP_TOOLS = [
	{
		name: "list_vaults",
		description: "List available vaults",
	},
	{
		name: "create_note",
		description: "Create a markdown note",
	},
	{
		name: "search_notes",
		description: "Search markdown notes",
	},
] as const

const CLIENT_GUIDES = [
	{
		name: "Claude Code",
		description: "Add an MCP server using the Claude Code CLI.",
		snippet: "claude mcp add --transport http mdit http://127.0.0.1:39123/mcp",
	},
	{
		name: "Codex",
		description: "Register the MCP server with Codex CLI (or use config.toml).",
		snippet: `# CLI
codex mcp add mdit --url http://127.0.0.1:39123/mcp

# ~/.codex/config.toml
[mcp_servers.mdit]
url = "http://127.0.0.1:39123/mcp"`,
	},
	{
		name: "Cursor",
		description: "Add this server to Cursor MCP settings JSON.",
		snippet: `{
  "mcpServers": {
    "mdit": {
      "url": "http://127.0.0.1:39123/mcp"
    }
  }
}`,
	},
] as const

export function ApiMcpTab() {
	const {
		licenseStatus,
		localApiEnabled,
		setLocalApiEnabled,
		localApiError,
	} = useStore(
		useShallow((state) => ({
			licenseStatus: state.status,
			localApiEnabled: state.localApiEnabled,
			setLocalApiEnabled: state.setLocalApiEnabled,
			localApiError: state.localApiError,
		})),
	)

	return (
		<div className="flex-1 overflow-y-auto px-12 pt-12 pb-24">
			<FieldSet className="border-b pb-8">
				<FieldLegend>Local API/MCP Server</FieldLegend>
				<FieldDescription>
					Enable or disable the local server that provides REST APIs and MCP
					tools.
				</FieldDescription>
				<FieldGroup>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldLabel>Server Toggle</FieldLabel>
							<FieldDescription>
								{licenseStatus === "valid" ? (
									<>
										Base URL: <code>http://127.0.0.1:39123</code>
									</>
								) : (
									"License activation required"
								)}
							</FieldDescription>
							{localApiError && (
								<p className="mt-2 text-sm text-destructive">{localApiError}</p>
							)}
						</FieldContent>
						<Switch
							checked={localApiEnabled}
							onCheckedChange={setLocalApiEnabled}
							disabled={licenseStatus !== "valid"}
						/>
					</Field>
				</FieldGroup>
			</FieldSet>

			<FieldSet className="mt-8 border-b pb-8">
				<FieldLegend>Available REST APIs</FieldLegend>
				<FieldDescription>
					These are the currently implemented local REST APIs.
				</FieldDescription>
				<FieldGroup className="gap-2">
					{REST_APIS.map((api) => (
						<Field key={api.path} className="rounded-md border px-3 py-2">
							<FieldContent>
								<FieldLabel className="font-mono text-xs">
									{api.method} {api.path}
								</FieldLabel>
								<FieldDescription>{api.description}</FieldDescription>
							</FieldContent>
						</Field>
					))}
				</FieldGroup>
			</FieldSet>

			<FieldSet className="mt-8 border-b pb-8">
				<FieldLegend>Available MCP Tools</FieldLegend>
				<FieldDescription>
					Exposed through MCP endpoint <code>/mcp</code>.
				</FieldDescription>
				<FieldGroup className="gap-2">
					{MCP_TOOLS.map((tool) => (
						<Field key={tool.name} className="rounded-md border px-3 py-2">
							<FieldContent>
								<FieldLabel className="font-mono text-xs">
									{tool.name}
								</FieldLabel>
								<FieldDescription>{tool.description}</FieldDescription>
							</FieldContent>
						</Field>
					))}
				</FieldGroup>
			</FieldSet>

			<FieldSet className="mt-8">
				<FieldLegend>Connect from Claude Code / Codex / Cursor</FieldLegend>
				<FieldDescription>
					Field names may vary by client version; keep the endpoint URL
					unchanged.
				</FieldDescription>
				<FieldGroup className="gap-4">
					{CLIENT_GUIDES.map((client) => (
						<Field key={client.name} orientation="vertical">
							<FieldContent>
								<FieldLabel>{client.name}</FieldLabel>
								<FieldDescription>{client.description}</FieldDescription>
							</FieldContent>
							<pre className="rounded-md border bg-muted px-3 py-2 text-xs whitespace-pre-wrap">
								{client.snippet}
							</pre>
						</Field>
					))}
				</FieldGroup>
			</FieldSet>
		</div>
	)
}
