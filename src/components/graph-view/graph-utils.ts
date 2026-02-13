import type {
	GraphNode,
	GraphNodeOpenAction,
	GraphRenderNode,
	GraphViewData,
} from "./types"

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
