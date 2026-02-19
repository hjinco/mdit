import {
	BoldPlugin,
	CodePlugin,
	ItalicPlugin,
	KbdPlugin,
	StrikethroughPlugin,
	SubscriptPlugin,
	SuperscriptPlugin,
	UnderlinePlugin,
} from "@platejs/basic-nodes/react"

import { CodeLeaf } from "../ui/node-code"
import { KbdLeaf } from "../ui/node-kbd"

export const BasicMarksKit = [
	BoldPlugin,
	ItalicPlugin,
	UnderlinePlugin,
	CodePlugin.configure({
		node: { component: CodeLeaf },
		shortcuts: { toggle: { keys: "mod+e" } },
	}),
	StrikethroughPlugin.configure({
		shortcuts: { toggle: { keys: "mod+shift+x" } },
	}),
	SubscriptPlugin.configure({
		shortcuts: { toggle: { keys: "mod+comma" } },
	}),
	SuperscriptPlugin.configure({
		shortcuts: { toggle: { keys: "mod+period" } },
	}),
	KbdPlugin.withComponent(KbdLeaf),
]
