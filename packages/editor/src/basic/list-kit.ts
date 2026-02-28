import { ListPlugin } from "@platejs/list/react"
import { KEYS } from "platejs"
import { BlockList } from "../basic/node-list"
import { IndentKit } from "./indent-kit"

export const ListKit = [
	...IndentKit,
	ListPlugin.configure({
		inject: {
			targetPlugins: [KEYS.p],
		},
		render: {
			belowNodes: BlockList,
		},
	}),
]
