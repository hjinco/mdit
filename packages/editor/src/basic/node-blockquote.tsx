import { PlateElement, type PlateElementProps } from "platejs/react"

export function BlockquoteElement(props: PlateElementProps) {
	return (
		<PlateElement
			as="blockquote"
			className="my-1 border-l-3 border-primary pl-6 italic"
			{...props}
		/>
	)
}
