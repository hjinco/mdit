import { getLinkAttributes } from "@platejs/link"
import type { TLinkElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement } from "platejs/react"
import type { AnchorHTMLAttributes, MouseEventHandler } from "react"

type TLinkElementWithWiki = TLinkElement & {
	wiki?: boolean
	wikiTarget?: string
}

export function LinkElement(
	props: PlateElementProps<TLinkElementWithWiki> & {
		defaultLinkAttributes?: Pick<
			AnchorHTMLAttributes<HTMLAnchorElement>,
			"onClick" | "onMouseDown"
		>
	},
) {
	const linkAttributes = getLinkAttributes(props.editor, props.element)
	const onClick =
		(props.defaultLinkAttributes
			?.onClick as MouseEventHandler<HTMLAnchorElement>) ??
		(linkAttributes.onClick as MouseEventHandler<HTMLAnchorElement> | undefined)
	const onMouseDown =
		(props.defaultLinkAttributes
			?.onMouseDown as MouseEventHandler<HTMLAnchorElement>) ??
		(linkAttributes.onMouseDown as
			| MouseEventHandler<HTMLAnchorElement>
			| undefined)

	return (
		<PlateElement
			{...props}
			as="a"
			className="cursor-pointer font-medium text-primary underline decoration-primary underline-offset-4 break-all"
			attributes={{
				...props.attributes,
				...linkAttributes,
				"data-link-url": props.element.url ?? "",
				"data-wiki": props.element.wiki ? "true" : undefined,
				"data-wiki-target": props.element.wikiTarget,
				onClick,
				onMouseDown,
				onMouseOver: (e) => {
					e.stopPropagation()
				},
			}}
		>
			{props.children}
		</PlateElement>
	)
}
