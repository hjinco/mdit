import type { FrontmatterRow as KVRow } from "../nodes/node-frontmatter"

export function createRowId() {
	return Math.random().toString(36).slice(2, 9)
}

export function createDefaultFrontmatterRows(): KVRow[] {
	return [
		{
			id: createRowId(),
			key: "title",
			type: "string",
			value: "",
		},
	]
}
