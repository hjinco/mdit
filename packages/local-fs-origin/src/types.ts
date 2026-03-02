export type LocalMutationTargetScope = "exact" | "subtree"

export type LocalMutationTarget = {
	path: string
	scope: LocalMutationTargetScope
}

export type RegisterLocalMutationInput = {
	workspacePath: string
	targets: LocalMutationTarget[]
	ttlMs?: number
}

export type ResolveOriginInput = {
	workspacePath: string
	relPaths: string[]
	nowMs?: number
}

export type ResolvedOrigins = {
	externalRelPaths: string[]
	localRelPaths: string[]
}

export type LocalMutationJournal = {
	register: (input: RegisterLocalMutationInput) => void
	resolve: (input: ResolveOriginInput) => ResolvedOrigins
	prune: (nowMs?: number) => void
	clearWorkspace: (workspacePath: string) => void
}
