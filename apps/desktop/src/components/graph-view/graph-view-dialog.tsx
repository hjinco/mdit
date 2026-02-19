import { invoke } from "@tauri-apps/api/core"
import { resolve } from "pathe"
import { useCallback, useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useStore } from "@/store"
import { GraphCanvas } from "./graph-canvas"
import type { GraphNodeOpenAction, GraphViewData } from "./types"

const EMPTY_GRAPH_DATA: GraphViewData = {
	nodes: [],
	edges: [],
}

export function GraphViewDialog() {
	const {
		isGraphViewDialogOpen,
		setGraphViewDialogOpen,
		workspacePath,
		openTab,
	} = useStore(
		useShallow((state) => ({
			isGraphViewDialogOpen: state.isGraphViewDialogOpen,
			setGraphViewDialogOpen: state.setGraphViewDialogOpen,
			workspacePath: state.workspacePath,
			openTab: state.openTab,
		})),
	)

	const [data, setData] = useState<GraphViewData>(EMPTY_GRAPH_DATA)
	const [isLoading, setIsLoading] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const requestIdRef = useRef(0)

	const fetchGraphData = useCallback(async () => {
		if (!workspacePath) {
			setData(EMPTY_GRAPH_DATA)
			setErrorMessage(null)
			return
		}

		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId
		setIsLoading(true)
		setErrorMessage(null)

		try {
			const result = await invoke<GraphViewData>(
				"get_graph_view_data_command",
				{
					workspacePath,
				},
			)
			if (requestIdRef.current !== requestId) {
				return
			}
			setData(result)
		} catch (error) {
			if (requestIdRef.current !== requestId) {
				return
			}

			setData(EMPTY_GRAPH_DATA)
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Failed to load graph data from index.",
			)
		} finally {
			if (requestIdRef.current === requestId) {
				setIsLoading(false)
			}
		}
	}, [workspacePath])

	useEffect(() => {
		if (!isGraphViewDialogOpen) {
			return
		}

		fetchGraphData()
	}, [fetchGraphData, isGraphViewDialogOpen])

	const handleNodeAction = useCallback(
		(action: GraphNodeOpenAction) => {
			if (action.type === "unresolved") {
				return
			}

			if (!workspacePath) {
				return
			}

			openTab(resolve(workspacePath, action.relPath))
			setGraphViewDialogOpen(false)
		},
		[openTab, setGraphViewDialogOpen, workspacePath],
	)

	const hasNodes = data.nodes.length > 0

	return (
		<Dialog open={isGraphViewDialogOpen} onOpenChange={setGraphViewDialogOpen}>
			<DialogContent
				className="w-full md:max-w-[calc(100vw-8rem)] h-[calc(100vh-8rem)] p-0 overflow-hidden flex flex-col gap-0"
				showCloseButton
			>
				<header className="absolute top-0 left-0 right-0 h-12 shrink-0 px-3 flex items-center">
					<div className="min-w-0">
						<DialogTitle className="text-sm font-medium">
							Graph View
						</DialogTitle>
						<p className="text-[11px] text-muted-foreground">
							{data.nodes.length} nodes • {data.edges.length} edges
						</p>
					</div>
				</header>

				<div className="flex-1 min-h-0">
					{errorMessage ? (
						<div className="h-full flex items-center justify-center px-6">
							<div className="max-w-md text-center space-y-3">
								<p className="text-sm font-medium">Failed to load graph view</p>
								<p className="text-xs text-muted-foreground break-words">
									{errorMessage}
								</p>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={fetchGraphData}
								>
									Try again
								</Button>
							</div>
						</div>
					) : hasNodes ? (
						<GraphCanvas data={data} onNodeAction={handleNodeAction} />
					) : isLoading ? null : (
						<div className="h-full flex items-center justify-center text-sm text-muted-foreground">
							Empty
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
