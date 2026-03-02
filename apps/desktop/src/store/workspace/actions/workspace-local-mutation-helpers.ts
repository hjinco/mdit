import type { LocalMutationTarget } from "@mdit/local-fs-origin"
import type { WorkspaceSlice } from "../workspace-slice"

type RegisterLocalMutation = WorkspaceSlice["registerLocalMutation"]

const toMutationScope = (isDirectory: boolean): LocalMutationTarget["scope"] =>
	isDirectory ? "subtree" : "exact"

export const registerExactLocalMutation = (
	registerLocalMutation: RegisterLocalMutation,
	path: string,
) => {
	registerLocalMutation([{ path, scope: "exact" }])
}

export const registerPathLocalMutation = (
	registerLocalMutation: RegisterLocalMutation,
	path: string,
	isDirectory: boolean,
) => {
	registerLocalMutation([{ path, scope: toMutationScope(isDirectory) }])
}

export const registerSubtreeLocalMutations = (
	registerLocalMutation: RegisterLocalMutation,
	paths: string[],
) => {
	if (paths.length === 0) {
		return
	}

	registerLocalMutation(paths.map((path) => ({ path, scope: "subtree" })))
}

export const registerMoveLocalMutation = (
	registerLocalMutation: RegisterLocalMutation,
	input: {
		sourcePath: string
		targetPath: string
		isDirectory: boolean
	},
) => {
	const scope = toMutationScope(input.isDirectory)
	registerLocalMutation([
		{ path: input.sourcePath, scope },
		{ path: input.targetPath, scope },
	])
}
