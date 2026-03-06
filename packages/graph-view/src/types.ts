export type GraphNode = {
	id: string
	relPath: string
	fileName: string
	unresolved: boolean
}

export type GraphEdge = {
	source: string
	target: string
	unresolved: boolean
}

export type GraphViewData = {
	nodes: GraphNode[]
	edges: GraphEdge[]
}

export type GraphRenderNode = GraphNode & {
	degree: number
}
