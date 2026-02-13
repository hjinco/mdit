import { describe, expect, it } from "vitest"
import {
	buildNodeDegreeMap,
	getGraphDegradeProfile,
	getNodeOpenAction,
	getNodeVisualState,
	sampleEdgesForRender,
	toRenderNodes,
} from "./graph-utils"
import type { GraphEdge, GraphViewData } from "./types"

const fixture: GraphViewData = {
	nodes: [
		{
			id: "doc:1",
			relPath: "a.md",
			fileName: "a",
			unresolved: false,
		},
		{
			id: "doc:2",
			relPath: "b.md",
			fileName: "b",
			unresolved: false,
		},
		{
			id: "unresolved:missing.md",
			relPath: "missing.md",
			fileName: "missing",
			unresolved: true,
		},
	],
	edges: [
		{
			source: "doc:1",
			target: "doc:2",
			unresolved: false,
		},
		{
			source: "doc:1",
			target: "unresolved:missing.md",
			unresolved: true,
		},
	],
}

describe("buildNodeDegreeMap", () => {
	it("counts node degree using all edges", () => {
		const degreeMap = buildNodeDegreeMap(fixture)
		expect(degreeMap.get("doc:1")).toBe(2)
		expect(degreeMap.get("doc:2")).toBe(1)
		expect(degreeMap.get("unresolved:missing.md")).toBe(1)
	})
})

describe("toRenderNodes", () => {
	it("attaches computed degree to each node", () => {
		const nodes = toRenderNodes(fixture)
		const byId = new Map(nodes.map((node) => [node.id, node]))
		expect(byId.get("doc:1")?.degree).toBe(2)
		expect(byId.get("doc:2")?.degree).toBe(1)
		expect(byId.get("unresolved:missing.md")?.degree).toBe(1)
	})
})

describe("getNodeVisualState", () => {
	it("returns unresolved style for ghost nodes", () => {
		expect(getNodeVisualState(fixture.nodes[2])).toBe("unresolved")
		expect(getNodeVisualState(fixture.nodes[0])).toBe("resolved")
	})
})

describe("getNodeOpenAction", () => {
	it("returns open action for resolved nodes", () => {
		expect(getNodeOpenAction(fixture.nodes[0])).toEqual({
			type: "open",
			relPath: "a.md",
		})
	})

	it("returns unresolved action for ghost nodes", () => {
		expect(getNodeOpenAction(fixture.nodes[2])).toEqual({
			type: "unresolved",
			relPath: "missing.md",
		})
	})
})

describe("getGraphDegradeProfile", () => {
	it("keeps default profile for small graphs", () => {
		const profile = getGraphDegradeProfile(100, 200)
		expect(profile).toEqual({
			isDegraded: false,
			simulationTickCap: 220,
			edgeRenderLimit: 200,
			labelVisibleScale: 0.5,
		})
	})

	it("reduces simulation and edge count for large graphs", () => {
		const profile = getGraphDegradeProfile(400, 1500)
		expect(profile).toEqual({
			isDegraded: true,
			simulationTickCap: 185,
			edgeRenderLimit: 800,
			labelVisibleScale: 0.95,
		})
	})
})

describe("sampleEdgesForRender", () => {
	it("prioritizes unresolved edges and respects the limit", () => {
		const edges: GraphEdge[] = [
			{
				source: "doc:1",
				target: "doc:2",
				unresolved: false,
			},
			{
				source: "doc:2",
				target: "unresolved:foo.md",
				unresolved: true,
			},
			{
				source: "doc:3",
				target: "doc:4",
				unresolved: false,
			},
			{
				source: "doc:5",
				target: "unresolved:bar.md",
				unresolved: true,
			},
		]

		expect(sampleEdgesForRender(edges, 3)).toEqual([
			edges[1],
			edges[3],
			edges[0],
		])
	})
})
