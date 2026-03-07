export type CommandMenuEntry = {
	path: string
	name: string
	isDirectory: boolean
	modifiedAt?: Date
	children?: CommandMenuEntry[]
}

export type CommandMenuContentMatch = {
	path: string
	lineNumber: number
	lineText: string
}

export type CommandMenuSemanticResult = {
	path: string
	name: string
	similarity: number
	createdAt?: Date
	modifiedAt?: Date
}

export type CommandMenuTagResult = {
	path: string
	name: string
	modifiedAt?: Date
}

export type CommandMenuContentSearch = (
	query: string,
	workspacePath: string,
) => Promise<CommandMenuContentMatch[]>

export type CommandMenuSemanticSearch = (
	query: string,
	workspacePath: string,
) => Promise<CommandMenuSemanticResult[]>

export type CommandMenuTagSearch = (
	query: string,
	workspacePath: string,
) => Promise<CommandMenuTagResult[]>
