import { Button } from "@mdit/ui/components/button"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import { Input } from "@mdit/ui/components/input"
import { Switch } from "@mdit/ui/components/switch"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import {
	ensureLocalApiAuthToken,
	rotateLocalApiAuthToken,
} from "@/services/local-api-auth-service"
import { setLocalApiAuthToken } from "@/services/local-api-service"
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
		snippet:
			'claude mcp add --transport http mdit "http://127.0.0.1:39123/mcp?token=<TOKEN>"',
	},
	{
		name: "Codex",
		description: "Register the MCP server with Codex CLI (or use config.toml).",
		snippet: `# CLI
codex mcp add mdit --url "http://127.0.0.1:39123/mcp?token=<TOKEN>"

# ~/.codex/config.toml
[mcp_servers.mdit]
url = "http://127.0.0.1:39123/mcp?token=<TOKEN>"`,
	},
	{
		name: "Cursor",
		description: "Add this server to Cursor MCP settings JSON.",
		snippet: `{
  "mcpServers": {
    "mdit": {
      "url": "http://127.0.0.1:39123/mcp?token=<TOKEN>"
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
		setLocalApiError,
	} = useStore(
		useShallow((state) => ({
			licenseStatus: state.status,
			localApiEnabled: state.localApiEnabled,
			setLocalApiEnabled: state.setLocalApiEnabled,
			localApiError: state.localApiError,
			setLocalApiError: state.setLocalApiError,
		})),
	)
	const [token, setToken] = useState("")
	const [tokenCopied, setTokenCopied] = useState(false)

	useEffect(() => {
		let isActive = true

		const loadToken = async () => {
			try {
				const ensuredToken = await ensureLocalApiAuthToken()
				if (!isActive) {
					return
				}
				setToken(ensuredToken)
				await setLocalApiAuthToken(ensuredToken)
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error ?? "Unknown")
				toast.error("Failed to load local API auth token")
				console.error("Failed to initialize local API auth token:", error)
				if (isActive) {
					setLocalApiError(`Failed to load local API auth token: ${message}`)
				}
			}
		}

		void loadToken()

		return () => {
			isActive = false
		}
	}, [setLocalApiError])

	const handleCopyToken = async () => {
		if (!token) return
		try {
			await navigator.clipboard.writeText(token)
			setTokenCopied(true)
			setTimeout(() => setTokenCopied(false), 2000)
		} catch (error) {
			console.error("Clipboard write failed:", error)
			toast.error("Failed to copy")
		}
	}

	const copyToClipboard = async (value: string, successMessage: string) => {
		try {
			await navigator.clipboard.writeText(value)
			toast.success(successMessage)
		} catch (error) {
			console.error("Clipboard write failed:", error)
			toast.error("Failed to copy")
		}
	}

	const handleRotateToken = async () => {
		try {
			const rotatedToken = await rotateLocalApiAuthToken()
			await setLocalApiAuthToken(rotatedToken)
			setToken(rotatedToken)
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error ?? "Unknown")
			toast.error("Failed to rotate local API token")
			setLocalApiError(`Failed to rotate local API auth token: ${message}`)
		}
	}

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
				<FieldLegend>Authentication Token</FieldLegend>
				<FieldDescription>
					All local API endpoints require this token except{" "}
					<code>/healthz</code>.
				</FieldDescription>
				<FieldGroup className="gap-4">
					<Field orientation="vertical">
						<FieldContent>
							<FieldLabel>Token</FieldLabel>
						</FieldContent>
						<div className="flex items-center gap-2 mt-2">
							<div className="relative flex-1">
								<Input
									readOnly
									type="text"
									value={token}
									placeholder="Loading token..."
									className="font-mono text-xs pr-10"
								/>
								<div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground hover:text-foreground"
										onClick={handleCopyToken}
										disabled={!token}
										title="Copy Token"
									>
										{tokenCopied ? (
											<Check className="size-4" />
										) : (
											<Copy className="size-4" />
										)}
									</Button>
								</div>
							</div>
							<Button
								variant="secondary"
								className="shrink-0"
								onClick={handleRotateToken}
							>
								Regenerate
							</Button>
						</div>
					</Field>
				</FieldGroup>
			</FieldSet>

			<FieldSet className="mt-8 border-b pb-8">
				<FieldLegend>Available REST APIs</FieldLegend>
				<FieldDescription>
					Requests must include an{" "}
					<code>Authorization: Bearer &lt;token&gt;</code> header.
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
					Exposed through MCP endpoint <code>/mcp</code> using{" "}
					<code>?token=&lt;token&gt;</code> in the URL.
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
					Field names may vary by client version.
				</FieldDescription>
				<FieldGroup className="gap-4">
					{CLIENT_GUIDES.map((client) => (
						<Field key={client.name} orientation="vertical">
							<FieldContent>
								<FieldLabel>{client.name}</FieldLabel>
								<FieldDescription>{client.description}</FieldDescription>
							</FieldContent>
							<div className="relative group/snippet">
								<pre className="rounded-md border bg-muted px-3 py-2 text-xs whitespace-pre-wrap pr-10">
									{token
										? client.snippet.replace(/<TOKEN>/g, token)
										: client.snippet}
								</pre>
								<Button
									variant="ghost"
									size="icon"
									className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover\/snippet:opacity-100 transition-opacity"
									onClick={() =>
										copyToClipboard(
											token
												? client.snippet.replace(/<TOKEN>/g, token)
												: client.snippet,
											"Snippet copied",
										)
									}
									disabled={!token}
									title="Copy Snippet"
								>
									<Copy className="size-3" />
								</Button>
							</div>
						</Field>
					))}
				</FieldGroup>
			</FieldSet>
		</div>
	)
}
