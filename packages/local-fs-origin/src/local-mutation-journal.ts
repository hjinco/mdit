import { isAbsolute, normalize, resolve } from "pathe"
import type {
	LocalMutationJournal,
	RegisterLocalMutationInput,
	ResolvedOrigins,
	ResolveOriginInput,
} from "./types"

type LocalMutationJournalOptions = {
	defaultTtlMs?: number
	now?: () => number
}

type WorkspaceMutationEntries = {
	exactPathExpiresAt: Map<string, number>
	subtreePathExpiresAt: Map<string, number>
}

export const DEFAULT_LOCAL_MUTATION_TTL_MS = 3000
const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:\/$/
const WINDOWS_PATH_PREFIX_REGEX = /^[A-Za-z]:\//
const UNC_PATH_PREFIX_REGEX = /^\/\/[^/]+\/[^/]+/

const normalizePathSeparators = (path: string): string => {
	const normalized = normalize(path)
	if (normalized.length <= 1) {
		return normalized
	}
	if (WINDOWS_DRIVE_ROOT_REGEX.test(normalized)) {
		return normalized
	}

	return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
}

const normalizeForComparison = (path: string): string => {
	const normalized = normalizePathSeparators(path)
	if (
		WINDOWS_PATH_PREFIX_REGEX.test(normalized) ||
		UNC_PATH_PREFIX_REGEX.test(normalized)
	) {
		return normalized.toLowerCase()
	}

	return normalized
}

const isPathEqualOrDescendant = (path: string, parentPath: string): boolean => {
	const normalizedPath = normalizeForComparison(path)
	const normalizedParent = normalizeForComparison(parentPath)

	if (normalizedPath === normalizedParent) {
		return true
	}

	return normalizedPath.startsWith(`${normalizedParent}/`)
}

const normalizeWorkspacePath = (workspacePath: string): string =>
	normalizeForComparison(workspacePath)

const toAbsolutePath = (workspacePath: string, path: string): string => {
	if (isAbsolute(path)) {
		return normalizeForComparison(path)
	}

	return normalizeForComparison(resolve(workspacePath, path))
}

const setPathExpiry = (
	pathExpiresAt: Map<string, number>,
	path: string,
	expiresAtMs: number,
) => {
	const existingExpiresAtMs = pathExpiresAt.get(path)
	if (existingExpiresAtMs === undefined || existingExpiresAtMs < expiresAtMs) {
		pathExpiresAt.set(path, expiresAtMs)
	}
}

const prunePathExpiryMap = (
	pathExpiresAt: Map<string, number>,
	nowMs: number,
) => {
	for (const [path, expiresAtMs] of pathExpiresAt) {
		if (expiresAtMs <= nowMs) {
			pathExpiresAt.delete(path)
		}
	}
}

const hasUnexpiredSubtreeMatch = (
	absolutePath: string,
	subtreePathExpiresAt: ReadonlyMap<string, number>,
	nowMs: number,
): boolean => {
	for (const [subtreePath, expiresAtMs] of subtreePathExpiresAt) {
		if (expiresAtMs <= nowMs) {
			continue
		}
		if (isPathEqualOrDescendant(absolutePath, subtreePath)) {
			return true
		}
	}

	return false
}

const pruneWorkspaceEntries = (
	workspaceEntries: WorkspaceMutationEntries,
	nowMs: number,
) => {
	prunePathExpiryMap(workspaceEntries.exactPathExpiresAt, nowMs)
	prunePathExpiryMap(workspaceEntries.subtreePathExpiresAt, nowMs)
}

const createWorkspaceMutationEntries = (): WorkspaceMutationEntries => {
	return {
		exactPathExpiresAt: new Map<string, number>(),
		subtreePathExpiresAt: new Map<string, number>(),
	}
}

const partitionPathsByOrigin = (
	workspacePath: string,
	relPaths: string[],
	workspaceEntries: WorkspaceMutationEntries,
	nowMs: number,
): ResolvedOrigins => {
	const localRelPaths: string[] = []
	const externalRelPaths: string[] = []

	for (const relPath of relPaths) {
		const absolutePath = toAbsolutePath(workspacePath, relPath)
		const exactExpiresAtMs =
			workspaceEntries.exactPathExpiresAt.get(absolutePath)
		const hasExactMatch =
			exactExpiresAtMs !== undefined && exactExpiresAtMs > nowMs
		const hasSubtreeMatch = hasUnexpiredSubtreeMatch(
			absolutePath,
			workspaceEntries.subtreePathExpiresAt,
			nowMs,
		)

		if (hasExactMatch || hasSubtreeMatch) {
			localRelPaths.push(relPath)
			continue
		}

		externalRelPaths.push(relPath)
	}

	return {
		externalRelPaths,
		localRelPaths,
	}
}

export const createLocalMutationJournal = (
	options: LocalMutationJournalOptions = {},
): LocalMutationJournal => {
	const defaultTtlMs = Math.max(
		1,
		options.defaultTtlMs ?? DEFAULT_LOCAL_MUTATION_TTL_MS,
	)
	const now = options.now ?? (() => Date.now())

	const entriesByWorkspace = new Map<string, WorkspaceMutationEntries>()

	const prune = (nowMs = now()) => {
		for (const [workspacePath, workspaceEntries] of entriesByWorkspace) {
			pruneWorkspaceEntries(workspaceEntries, nowMs)
			if (
				workspaceEntries.exactPathExpiresAt.size === 0 &&
				workspaceEntries.subtreePathExpiresAt.size === 0
			) {
				entriesByWorkspace.delete(workspacePath)
			}
		}
	}

	const register = (input: RegisterLocalMutationInput) => {
		if (input.targets.length === 0) {
			return
		}

		const currentNow = now()
		prune(currentNow)

		const workspacePath = normalizeWorkspacePath(input.workspacePath)
		const ttlMs = Math.max(1, input.ttlMs ?? defaultTtlMs)
		const expiresAtMs = currentNow + ttlMs
		const workspaceEntries =
			entriesByWorkspace.get(workspacePath) ?? createWorkspaceMutationEntries()

		if (!entriesByWorkspace.has(workspacePath)) {
			entriesByWorkspace.set(workspacePath, workspaceEntries)
		}

		for (const target of input.targets) {
			const absolutePath = toAbsolutePath(workspacePath, target.path)
			const pathExpiresAt =
				target.scope === "exact"
					? workspaceEntries.exactPathExpiresAt
					: workspaceEntries.subtreePathExpiresAt
			setPathExpiry(pathExpiresAt, absolutePath, expiresAtMs)
		}
	}

	const resolveOrigins = (input: ResolveOriginInput): ResolvedOrigins => {
		const currentNow = input.nowMs ?? now()
		prune(currentNow)

		const workspacePath = normalizeWorkspacePath(input.workspacePath)
		if (input.relPaths.length === 0) {
			return {
				externalRelPaths: [],
				localRelPaths: [],
			}
		}

		const workspaceEntries = entriesByWorkspace.get(workspacePath)
		if (!workspaceEntries) {
			return {
				externalRelPaths: [...input.relPaths],
				localRelPaths: [],
			}
		}

		return partitionPathsByOrigin(
			workspacePath,
			input.relPaths,
			workspaceEntries,
			currentNow,
		)
	}

	const clearWorkspace = (workspacePath: string) => {
		const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
		entriesByWorkspace.delete(normalizedWorkspacePath)
	}

	return {
		register,
		resolve: resolveOrigins,
		prune,
		clearWorkspace,
	}
}
