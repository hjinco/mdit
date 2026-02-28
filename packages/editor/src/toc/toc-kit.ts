import { TocPlugin } from "@platejs/toc/react"

import { TocElement } from "../toc/node-toc"

export const TocKit = [
	TocPlugin.configure({
		options: {
			topOffset: 80,
		},
	}).withComponent(TocElement),
]
