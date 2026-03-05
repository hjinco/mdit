import { getLinkAttributes } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import type { TLinkElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement, usePluginOption } from "platejs/react"
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
	const isLinkPopoverOpen = usePluginOption(
		LinkPlugin,
		"isOpen",
		props.editor.id,
	)
	const linkAttributes = getLinkAttributes(props.editor, props.element)
	const linkAttributeHandlers = linkAttributes as Pick<
		AnchorHTMLAttributes<HTMLAnchorElement>,
		"onClick" | "onMouseDown"
	>
	const sanitizedHref = sanitizeLinkHref(props.element.url)
	const defaultOnClick =
		props.defaultLinkAttributes?.onClick ?? linkAttributeHandlers.onClick
	const defaultOnMouseDown =
		props.defaultLinkAttributes?.onMouseDown ??
		linkAttributeHandlers.onMouseDown
	const onClick: MouseEventHandler<HTMLAnchorElement> | undefined =
		isLinkPopoverOpen
			? (event) => {
					event.preventDefault()
				}
			: defaultOnClick
	const onMouseDown = isLinkPopoverOpen ? undefined : defaultOnMouseDown

	return (
		<PlateElement
			{...props}
			as="a"
			className={`${isLinkPopoverOpen ? "cursor-text" : "cursor-pointer"} font-medium text-primary underline decoration-primary underline-offset-4 break-all`}
			attributes={{
				...props.attributes,
				...linkAttributes,
				href: sanitizedHref,
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

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])
const URI_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

function sanitizeLinkHref(url?: string): string | undefined {
	if (!url) {
		return undefined
	}

	const decoded = safelyDecodeUrl(url).trim()
	if (!decoded) {
		return undefined
	}

	if (!URI_SCHEME_REGEX.test(decoded)) {
		return decoded
	}

	const protocol = decoded.slice(0, decoded.indexOf(":") + 1).toLowerCase()
	if (ALLOWED_PROTOCOLS.has(protocol)) {
		return decoded
	}

	return undefined
}

function safelyDecodeUrl(url: string): string {
	try {
		return decodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}
