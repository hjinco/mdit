import type {
	GraphEdge,
	GraphNode,
	GraphNodeOpenAction,
	GraphRenderNode,
	GraphViewData,
} from "./types"

const NODE_THRESHOLD = 220
const EDGE_THRESHOLD = 800
const MIN_SIM_TICK_CAP = 80
const DEFAULT_SIM_TICKS = 220
const DEFAULT_LABEL_VISIBLE_SCALE = 0.5
const DEGRADED_LABEL_VISIBLE_SCALE = 0.95
const MIN_EDGE_RENDER_LIMIT = 500

export type GraphDegradeProfile = {
	isDegraded: boolean
	simulationTickCap: number
	edgeRenderLimit: number
	labelVisibleScale: number
}

export function buildNodeDegreeMap(data: GraphViewData): Map<string, number> {
	const degreeMap = new Map<string, number>()

	for (const node of data.nodes) {
		degreeMap.set(node.id, 0)
	}

	for (const edge of data.edges) {
		degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
		degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
	}

	return degreeMap
}

export function toRenderNodes(data: GraphViewData): GraphRenderNode[] {
	const degreeMap = buildNodeDegreeMap(data)
	return data.nodes.map((node) => ({
		...node,
		degree: degreeMap.get(node.id) ?? 0,
	}))
}

export function getGraphDegradeProfile(
	nodeCount: number,
	edgeCount: number,
): GraphDegradeProfile {
	const safeNodeCount = Math.max(0, nodeCount)
	const safeEdgeCount = Math.max(0, edgeCount)
	const level = Math.max(
		safeNodeCount / NODE_THRESHOLD,
		safeEdgeCount / EDGE_THRESHOLD,
	)

	if (level <= 1) {
		return {
			isDegraded: false,
			simulationTickCap: DEFAULT_SIM_TICKS,
			edgeRenderLimit: safeEdgeCount,
			labelVisibleScale: DEFAULT_LABEL_VISIBLE_SCALE,
		}
	}

	const calculatedEdgeLimit = Math.max(
		MIN_EDGE_RENDER_LIMIT,
		Math.floor(safeEdgeCount / level),
	)

	return {
		isDegraded: true,
		simulationTickCap: Math.max(
			MIN_SIM_TICK_CAP,
			DEFAULT_SIM_TICKS - Math.floor((level - 1) * 40),
		),
		edgeRenderLimit: Math.min(safeEdgeCount, calculatedEdgeLimit),
		labelVisibleScale: DEGRADED_LABEL_VISIBLE_SCALE,
	}
}

export function sampleEdgesForRender(
	edges: GraphEdge[],
	limit: number,
): GraphEdge[] {
	const safeLimit = Math.max(0, Math.floor(limit))
	if (safeLimit >= edges.length) {
		return edges
	}
	if (safeLimit === 0) {
		return []
	}

	const unresolved: GraphEdge[] = []
	const resolved: GraphEdge[] = []

	for (const edge of edges) {
		if (edge.unresolved) {
			unresolved.push(edge)
			if (unresolved.length >= safeLimit) {
				return unresolved
			}
			continue
		}
		resolved.push(edge)
	}

	if (unresolved.length >= safeLimit) {
		return unresolved
	}

	return unresolved.concat(resolved.slice(0, safeLimit - unresolved.length))
}

export function getNodeVisualState(node: GraphNode): "resolved" | "unresolved" {
	return node.unresolved ? "unresolved" : "resolved"
}

export function getNodeOpenAction(node: GraphNode): GraphNodeOpenAction {
	if (node.unresolved) {
		return {
			type: "unresolved",
			relPath: node.relPath,
		}
	}

	return {
		type: "open",
		relPath: node.relPath,
	}
}
