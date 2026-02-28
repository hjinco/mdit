import { cn } from "@mdit/ui/lib/utils"
import { BaseSuggestionPlugin } from "@platejs/suggestion"
import { CornerDownLeftIcon } from "lucide-react"
import type { TSuggestionData, TSuggestionText } from "platejs"
import type { PlateLeafProps, RenderNodeWrapper } from "platejs/react"
import { PlateLeaf, useEditorPlugin, usePluginOption } from "platejs/react"
import { useRef } from "react"
import type { SuggestionConfig } from "../suggestion/suggestion-kit"

const suggestionPluginKey = { key: BaseSuggestionPlugin.key } as const

export function SuggestionLeaf(props: PlateLeafProps<TSuggestionText>) {
	const { api, setOption } = useEditorPlugin(BaseSuggestionPlugin as any)
	const leaf = props.leaf

	const leafId: string = api.suggestion.nodeId(leaf) ?? ""
	const activeSuggestionId = usePluginOption(suggestionPluginKey, "activeId")
	const hoverSuggestionId = usePluginOption(suggestionPluginKey, "hoverId")
	const dataList = api.suggestion.dataList(leaf) as TSuggestionData[]

	const hasRemove = dataList.some((data) => data.type === "remove")
	const hasActive = dataList.some((data) => data.id === activeSuggestionId)
	const hasHover = dataList.some((data) => data.id === hoverSuggestionId)

	const diffOperation = { type: hasRemove ? "delete" : "insert" } as const

	const Component = ({ delete: "del", insert: "ins", update: "span" } as const)[
		diffOperation.type
	]

	return (
		<PlateLeaf
			{...props}
			as={Component}
			className={cn(
				"bg-blue-500/10 text-blue-400 no-underline transition-colors duration-200",
				(hasActive || hasHover) && "bg-blue-500/20",
				hasRemove && "bg-foreground/5 text-foreground/30",
				(hasActive || hasHover) && hasRemove && "bg-foreground/10 no-underline",
			)}
			attributes={{
				...props.attributes,
				onMouseEnter: () => setOption("hoverId", leafId),
				onMouseLeave: () => setOption("hoverId", null),
			}}
		>
			{props.children}
		</PlateLeaf>
	)
}

export const SuggestionLineBreak: RenderNodeWrapper<SuggestionConfig> = ({
	api,
	element,
}) => {
	if (!api.suggestion.isBlockSuggestion(element)) return

	const suggestionData = element.suggestion

	if (!suggestionData?.isLineBreak) return

	return function Component({ children }) {
		return (
			<>
				{children}
				<SuggestionLineBreakContent suggestionData={suggestionData} />
			</>
		)
	}
}

function SuggestionLineBreakContent({
	suggestionData,
}: {
	suggestionData: TSuggestionData
}) {
	const { type } = suggestionData
	const isRemove = type === "remove"
	const isInsert = type === "insert"

	const activeSuggestionId = usePluginOption(suggestionPluginKey, "activeId")
	const hoverSuggestionId = usePluginOption(suggestionPluginKey, "hoverId")

	const isActive = activeSuggestionId === suggestionData.id
	const isHover = hoverSuggestionId === suggestionData.id

	const spanRef = useRef<HTMLSpanElement>(null)

	return (
		<span
			ref={spanRef}
			className={cn(
				"absolute border-b-2 border-b-brand/[.24] bg-brand/[.08] text-justify text-brand/80 no-underline transition-colors duration-200",
				isInsert &&
					(isActive || isHover) &&
					"border-b-brand/[.60] bg-brand/[.13]",
				isRemove &&
					"border-b-gray-300 bg-gray-300/25 text-gray-400 line-through",
				isRemove &&
					(isActive || isHover) &&
					"border-b-gray-500 bg-gray-400/25 text-gray-500 no-underline",
			)}
			style={{
				bottom: 4.5,
				height: 21,
			}}
			contentEditable={false}
		>
			<CornerDownLeftIcon className="mt-0.5 size-4" />
		</span>
	)
}
