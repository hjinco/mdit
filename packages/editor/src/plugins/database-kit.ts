import type { NodeComponent } from "platejs"
import { createPlatePlugin } from "platejs/react"

export const DATABASE_KEY = "database"

export const createDatabaseKit = ({
	DatabaseElement,
}: {
	DatabaseElement: NodeComponent
}) => [
	createPlatePlugin({
		key: DATABASE_KEY,
		node: {
			component: DatabaseElement,
			isElement: true,
			isVoid: true,
		},
	}),
]
