import { Checkbox } from "@mdit/ui/components/checkbox"
import { cn } from "@mdit/ui/lib/utils"
import { isOrderedList } from "@platejs/list"
import {
	useTodoListElement,
	useTodoListElementState,
} from "@platejs/list/react"
import type { TListElement } from "platejs"
import { KEYS } from "platejs"
import {
	type PlateElementProps,
	type RenderNodeWrapper,
	useReadOnly,
} from "platejs/react"
import { useCallback } from "react"
import { resolveListStyleTypeByIndent } from "./list-style-utils"

const config: Record<
	string,
	{
		Li: React.FC<PlateElementProps>
		Marker: React.FC<PlateElementProps>
	}
> = {
	[KEYS.listTodo]: {
		Li: TodoLi,
		Marker: TodoMarker,
	},
}

export const BlockList: RenderNodeWrapper = (props) => {
	if (!props.element.listStyleType) return

	return (props) => <List {...props} />
}

function List(props: PlateElementProps) {
	const { listStart, listStyleType } = props.element as TListElement
	const indent = (props.element as { indent?: number }).indent
	const { Li, Marker } = config[listStyleType] ?? {}
	const List = isOrderedList(props.element) ? "ol" : "ul"
	const resolvedListStyleType = resolveListStyleTypeByIndent(
		listStyleType,
		indent,
	)

	return (
		<List
			className="relative m-0 p-0"
			style={{ listStyleType: resolvedListStyleType }}
			start={listStart}
		>
			{Marker && <Marker {...props} />}
			{Li ? <Li {...props} /> : <li>{props.children}</li>}
		</List>
	)
}

function TodoMarker(props: PlateElementProps) {
	const state = useTodoListElementState({ element: props.element })
	const { checkboxProps } = useTodoListElement(state)
	const readOnly = useReadOnly()
	const { checked, onCheckedChange, ...restCheckboxProps } = checkboxProps

	const handleCheckedChange = useCallback(
		(value: boolean) => {
			onCheckedChange(value)
		},
		[onCheckedChange],
	)

	return (
		<div contentEditable={false}>
			<Checkbox
				className={cn(
					"absolute top-1 -left-6",
					readOnly && "pointer-events-none",
				)}
				checked={checked === true}
				onCheckedChange={handleCheckedChange}
				{...restCheckboxProps}
			/>
		</div>
	)
}

function TodoLi(props: PlateElementProps) {
	return (
		<li
			className={cn(
				"list-none",
				(props.element.checked as boolean) &&
					"text-muted-foreground line-through",
			)}
		>
			{props.children}
		</li>
	)
}
