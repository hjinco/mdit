import { cn } from "@mdit/ui/lib/utils"
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from "d3-force"
import { relative } from "pathe"
import {
	type PointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type WheelEvent,
} from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import {
	getGraphDegradeProfile,
	getNodeOpenAction,
	sampleEdgesForRender,
	toRenderNodes,
} from "./graph-utils"
import type {
	GraphEdge,
	GraphNodeOpenAction,
	GraphRenderNode,
	GraphViewData,
} from "./types"

type PositionedNode = GraphRenderNode &
	SimulationNodeDatum & {
		x: number
		y: number
	}

type SimLink = SimulationLinkDatum<PositionedNode> & {
	source: string | PositionedNode
	target: string | PositionedNode
	unresolved: boolean
}

type ViewState = {
	x: number
	y: number
	scale: number
}

const DEFAULT_WIDTH = 960
const DEFAULT_HEIGHT = 640
const MIN_SCALE = 0.2
const MAX_SCALE = 3.2
const FIT_PADDING = 56
const WHEEL_ZOOM_SENSITIVITY = 0.0016
const VIEW_INTERPOLATION = 0.24

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function normalizeGraphPath(value: string) {
	return value.replace(/\\/g, "/")
}

function getNodeRadius(node: Pick<GraphRenderNode, "unresolved" | "degree">) {
	if (node.unresolved) {
		return 5.5
	}

	return Math.min(14, 6 + Math.sqrt(Math.max(node.degree, 1)) * 1.8)
}

function getFittedView(
	nodes: PositionedNode[],
	width: number,
	height: number,
): {
	x: number
	y: number
	scale: number
} {
	if (!nodes.length) {
		return { x: 0, y: 0, scale: 1 }
	}

	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY

	for (const node of nodes) {
		const radius = getNodeRadius(node)
		minX = Math.min(minX, node.x - radius)
		minY = Math.min(minY, node.y - radius)
		maxX = Math.max(maxX, node.x + radius)
		maxY = Math.max(maxY, node.y + radius)
	}

	const graphWidth = Math.max(1, maxX - minX)
	const graphHeight = Math.max(1, maxY - minY)
	const availableWidth = Math.max(1, width - FIT_PADDING * 2)
	const availableHeight = Math.max(1, height - FIT_PADDING * 2)
	const scale = clamp(
		Math.min(availableWidth / graphWidth, availableHeight / graphHeight),
		MIN_SCALE,
		MAX_SCALE,
	)
	const centerX = (minX + maxX) / 2
	const centerY = (minY + maxY) / 2

	return {
		x: width / 2 - centerX * scale,
		y: height / 2 - centerY * scale,
		scale,
	}
}

export function GraphCanvas({
	data,
	onNodeAction,
}: {
	data: GraphViewData
	onNodeAction: (action: GraphNodeOpenAction) => void
}) {
	const { tabPath, workspacePath } = useStore(
		useShallow((state) => ({
			tabPath: state.tab?.path ?? null,
			workspacePath: state.workspacePath,
		})),
	)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const svgRef = useRef<SVGSVGElement | null>(null)

	const [size, setSize] = useState<{
		width: number
		height: number
	} | null>(null)
	const [nodes, setNodes] = useState<PositionedNode[]>([])
	const [edges, setEdges] = useState<GraphEdge[]>([])
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [view, setView] = useState<ViewState>({
		x: 0,
		y: 0,
		scale: 1,
	})
	const viewRef = useRef(view)
	const viewTargetRef = useRef<ViewState | null>(null)
	const viewAnimationFrameRef = useRef<number | null>(null)

	const setViewState = useCallback(
		(updater: ViewState | ((previous: ViewState) => ViewState)) => {
			setView((previous) => {
				const nextView =
					typeof updater === "function"
						? (updater as (previous: ViewState) => ViewState)(previous)
						: updater
				viewRef.current = nextView
				return nextView
			})
		},
		[],
	)

	const stopViewAnimation = useCallback(() => {
		if (viewAnimationFrameRef.current !== null) {
			cancelAnimationFrame(viewAnimationFrameRef.current)
			viewAnimationFrameRef.current = null
		}
		viewTargetRef.current = null
	}, [])

	const animateToTargetView = useCallback(() => {
		if (viewAnimationFrameRef.current !== null) {
			return
		}

		const step = () => {
			const targetView = viewTargetRef.current
			if (!targetView) {
				viewAnimationFrameRef.current = null
				return
			}

			const currentView = viewRef.current
			const nextView: ViewState = {
				x: currentView.x + (targetView.x - currentView.x) * VIEW_INTERPOLATION,
				y: currentView.y + (targetView.y - currentView.y) * VIEW_INTERPOLATION,
				scale:
					currentView.scale +
					(targetView.scale - currentView.scale) * VIEW_INTERPOLATION,
			}

			const settled =
				Math.abs(targetView.x - nextView.x) < 0.25 &&
				Math.abs(targetView.y - nextView.y) < 0.25 &&
				Math.abs(targetView.scale - nextView.scale) < 0.001

			setViewState(settled ? targetView : nextView)

			if (settled) {
				viewTargetRef.current = null
				viewAnimationFrameRef.current = null
				return
			}

			viewAnimationFrameRef.current = requestAnimationFrame(step)
		}

		viewAnimationFrameRef.current = requestAnimationFrame(step)
	}, [setViewState])

	const panningRef = useRef<{
		pointerId: number
		startClientX: number
		startClientY: number
		originX: number
		originY: number
	} | null>(null)

	const nodeDragRef = useRef<{
		pointerId: number
		nodeId: string
		offsetX: number
		offsetY: number
		startWorldX: number
		startWorldY: number
	} | null>(null)

	useEffect(() => {
		return () => {
			if (viewAnimationFrameRef.current !== null) {
				cancelAnimationFrame(viewAnimationFrameRef.current)
			}
		}
	}, [])

	const nodeById = useMemo(() => {
		const map = new Map<string, PositionedNode>()
		for (const node of nodes) {
			map.set(node.id, node)
		}
		return map
	}, [nodes])

	const degradeProfile = useMemo(
		() => getGraphDegradeProfile(data.nodes.length, data.edges.length),
		[data.edges.length, data.nodes.length],
	)
	const currentTabRelPath = useMemo(() => {
		if (!workspacePath || !tabPath) {
			return null
		}
		return normalizeGraphPath(relative(workspacePath, tabPath))
	}, [tabPath, workspacePath])

	useEffect(() => {
		const target = containerRef.current
		if (!target) {
			return
		}

		const updateSize = (width: number, height: number) => {
			const nextWidth = Math.max(320, Math.floor(width))
			const nextHeight = Math.max(320, Math.floor(height))
			if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
				return
			}
			setSize((previous) => {
				if (
					previous &&
					previous.width === nextWidth &&
					previous.height === nextHeight
				) {
					return previous
				}
				return { width: nextWidth, height: nextHeight }
			})
		}

		const rect = target.getBoundingClientRect()
		if (rect.width > 0 && rect.height > 0) {
			updateSize(rect.width, rect.height)
		}

		if (typeof ResizeObserver === "undefined") {
			setSize(
				(previous) =>
					previous ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
			)
			return
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (!entry) {
				return
			}

			updateSize(entry.contentRect.width, entry.contentRect.height)
		})

		observer.observe(target)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		if (!size) {
			return
		}

		const renderNodes = toRenderNodes(data)
		if (!renderNodes.length) {
			stopViewAnimation()
			setNodes([])
			setEdges([])
			setViewState({ x: 0, y: 0, scale: 1 })
			return
		}

		const centerX = size.width / 2
		const centerY = size.height / 2
		const seededNodes: PositionedNode[] = renderNodes.map((node, index) => {
			const angle = (index / Math.max(1, renderNodes.length)) * Math.PI * 2
			const radius = Math.max(40, Math.min(size.width, size.height) * 0.18)
			return {
				...node,
				x: centerX + Math.cos(angle) * radius,
				y: centerY + Math.sin(angle) * radius,
			}
		})

		const edgesToRender = sampleEdgesForRender(
			data.edges,
			degradeProfile.edgeRenderLimit,
		)

		const links: SimLink[] = edgesToRender.map((edge) => ({
			source: edge.source,
			target: edge.target,
			unresolved: edge.unresolved,
		}))

		const simulation = forceSimulation(seededNodes)
			.force(
				"link",
				forceLink<PositionedNode, SimLink>(links)
					.id((node) => node.id)
					.distance((link) => (link.unresolved ? 120 : 90))
					.strength(0.28),
			)
			.force("charge", forceManyBody().strength(-185))
			.force(
				"collide",
				forceCollide<PositionedNode>().radius((node) =>
					node.unresolved ? 9 : 10 + Math.min(node.degree, 8) * 0.85,
				),
			)
			.force("center", forceCenter(centerX, centerY))
			.stop()

		for (let index = 0; index < degradeProfile.simulationTickCap; index += 1) {
			simulation.tick()
		}

		const nextNodes = seededNodes.map((node) => ({
			...node,
			x: Number.isFinite(node.x) ? node.x : centerX,
			y: Number.isFinite(node.y) ? node.y : centerY,
		}))

		setNodes(nextNodes)
		setEdges(edgesToRender)
		stopViewAnimation()
		setViewState(getFittedView(nextNodes, size.width, size.height))
		simulation.stop()
	}, [data, degradeProfile, setViewState, size, stopViewAnimation])

	const toWorldPoint = (clientX: number, clientY: number) => {
		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) {
			return null
		}

		const currentView = viewRef.current
		const localX = clientX - rect.left
		const localY = clientY - rect.top

		return {
			x: (localX - currentView.x) / currentView.scale,
			y: (localY - currentView.y) / currentView.scale,
		}
	}

	const handleBackgroundPointerDown = (event: PointerEvent<SVGRectElement>) => {
		if (event.button !== 0) {
			return
		}

		stopViewAnimation()
		setSelectedNodeId(null)
		event.currentTarget.setPointerCapture(event.pointerId)
		panningRef.current = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			originX: viewRef.current.x,
			originY: viewRef.current.y,
		}
	}

	const handleBackgroundPointerMove = (event: PointerEvent<SVGRectElement>) => {
		const panning = panningRef.current
		if (!panning || panning.pointerId !== event.pointerId) {
			return
		}

		const deltaX = event.clientX - panning.startClientX
		const deltaY = event.clientY - panning.startClientY
		viewTargetRef.current = {
			x: panning.originX + deltaX,
			y: panning.originY + deltaY,
			scale: viewRef.current.scale,
		}
		animateToTargetView()
	}

	const handleBackgroundPointerUp = (event: PointerEvent<SVGRectElement>) => {
		if (panningRef.current?.pointerId !== event.pointerId) {
			return
		}

		panningRef.current = null
		event.currentTarget.releasePointerCapture(event.pointerId)
	}

	const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
		event.preventDefault()

		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) {
			return
		}

		const pointerX = event.clientX - rect.left
		const pointerY = event.clientY - rect.top
		const sourceView = viewTargetRef.current ?? viewRef.current
		const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
		const nextScale = clamp(sourceView.scale * zoomFactor, MIN_SCALE, MAX_SCALE)
		if (nextScale === sourceView.scale) {
			return
		}

		const scaleRatio = nextScale / sourceView.scale
		viewTargetRef.current = {
			scale: nextScale,
			x: pointerX - (pointerX - sourceView.x) * scaleRatio,
			y: pointerY - (pointerY - sourceView.y) * scaleRatio,
		}
		animateToTargetView()
	}

	const handleNodePointerDown = (
		event: PointerEvent<SVGGElement>,
		node: PositionedNode,
	) => {
		if (event.button !== 0) {
			return
		}

		stopViewAnimation()
		event.stopPropagation()
		setSelectedNodeId(node.id)

		const world = toWorldPoint(event.clientX, event.clientY)
		if (!world) {
			return
		}

		nodeDragRef.current = {
			pointerId: event.pointerId,
			nodeId: node.id,
			offsetX: world.x - node.x,
			offsetY: world.y - node.y,
			startWorldX: world.x,
			startWorldY: world.y,
		}
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	const handleNodePointerMove = (
		event: PointerEvent<SVGGElement>,
		node: PositionedNode,
	) => {
		const dragging = nodeDragRef.current
		if (
			!dragging ||
			dragging.pointerId !== event.pointerId ||
			dragging.nodeId !== node.id
		) {
			return
		}

		const world = toWorldPoint(event.clientX, event.clientY)
		if (!world) {
			return
		}

		setNodes((previous) =>
			previous.map((entry) =>
				entry.id === node.id
					? {
							...entry,
							x: world.x - dragging.offsetX,
							y: world.y - dragging.offsetY,
						}
					: entry,
			),
		)
	}

	const handleNodePointerUp = (
		event: PointerEvent<SVGGElement>,
		node: PositionedNode,
	) => {
		const dragging = nodeDragRef.current
		if (
			!dragging ||
			dragging.pointerId !== event.pointerId ||
			dragging.nodeId !== node.id
		) {
			return
		}

		const world = toWorldPoint(event.clientX, event.clientY)
		const movedDistance = world
			? Math.hypot(
					world.x - dragging.startWorldX,
					world.y - dragging.startWorldY,
				)
			: 0

		nodeDragRef.current = null
		event.currentTarget.releasePointerCapture(event.pointerId)

		if (movedDistance < 4) {
			onNodeAction(getNodeOpenAction(node))
		}
	}

	const handleNodePointerCancel = (
		event: PointerEvent<SVGGElement>,
		node: PositionedNode,
	) => {
		const dragging = nodeDragRef.current
		if (
			!dragging ||
			dragging.pointerId !== event.pointerId ||
			dragging.nodeId !== node.id
		) {
			return
		}

		nodeDragRef.current = null
		event.currentTarget.releasePointerCapture(event.pointerId)
	}

	const renderLines = edges
		.map((edge) => {
			const source = nodeById.get(edge.source)
			const target = nodeById.get(edge.target)
			if (!source || !target) {
				return null
			}

			return (
				<line
					key={`${edge.source}::${edge.target}`}
					x1={source.x}
					y1={source.y}
					x2={target.x}
					y2={target.y}
					strokeDasharray={edge.unresolved ? "4 6" : undefined}
					className={cn(
						"stroke-[1.1] transition-colors",
						edge.unresolved
							? "stroke-muted-foreground/20"
							: "stroke-muted-foreground/35",
					)}
				/>
			)
		})
		.filter(Boolean)

	return (
		<div ref={containerRef} className="h-full w-full bg-muted/15">
			{size ? (
				<svg
					ref={svgRef}
					className="h-full w-full touch-none"
					viewBox={`0 0 ${size.width} ${size.height}`}
					onWheel={handleWheel}
				>
					<rect
						x={0}
						y={0}
						width={size.width}
						height={size.height}
						fill="transparent"
						onPointerDown={handleBackgroundPointerDown}
						onPointerMove={handleBackgroundPointerMove}
						onPointerUp={handleBackgroundPointerUp}
						onPointerCancel={handleBackgroundPointerUp}
					/>
					<g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
						{renderLines}
						{nodes.map((node) => {
							const isCurrentTabNode =
								currentTabRelPath !== null && node.relPath === currentTabRelPath
							const isFocused =
								hoveredNodeId === node.id || selectedNodeId === node.id
							const showLabel =
								isCurrentTabNode ||
								isFocused ||
								view.scale >= degradeProfile.labelVisibleScale
							const radius = getNodeRadius(node)
							const labelScale = 1 / view.scale
							const labelOffsetX = radius * view.scale + 6

							return (
								<g
									key={node.id}
									className="cursor-pointer"
									transform={`translate(${node.x},${node.y})`}
									onPointerDown={(event) => handleNodePointerDown(event, node)}
									onPointerMove={(event) => handleNodePointerMove(event, node)}
									onPointerUp={(event) => handleNodePointerUp(event, node)}
									onPointerCancel={(event) =>
										handleNodePointerCancel(event, node)
									}
									onPointerEnter={() => setHoveredNodeId(node.id)}
									onPointerLeave={() =>
										setHoveredNodeId((prev) => (prev === node.id ? null : prev))
									}
								>
									{isCurrentTabNode && (
										<circle
											r={radius + 5.6}
											className="fill-primary/20 stroke-primary/60 stroke-[1.6]"
										/>
									)}
									<circle
										r={
											radius +
											(isFocused ? 2.1 : 0) +
											(isCurrentTabNode ? 2.4 : 0)
										}
										className={cn(
											"transition-colors",
											isCurrentTabNode
												? node.unresolved
													? "fill-transparent stroke-primary stroke-[2.2]"
													: "fill-primary/90 stroke-primary stroke-[2.2]"
												: node.unresolved
													? "fill-transparent stroke-muted-foreground/55 stroke"
													: "fill-primary/70 stroke-primary/90 stroke",
										)}
									/>
									{showLabel && (
										<text
											x={labelOffsetX}
											y={4}
											transform={`scale(${labelScale})`}
											className="fill-foreground/95 text-[11px] select-none pointer-events-none"
										>
											{node.fileName}
										</text>
									)}
								</g>
							)
						})}
					</g>
				</svg>
			) : null}
		</div>
	)
}
