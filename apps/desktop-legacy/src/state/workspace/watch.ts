import { applyWorkspaceWatchBatch } from "./watch-batch"
import type {
	VaultWatchBatchPayload,
	WorkspaceWatchDependencies,
	WorkspaceWatchLease,
} from "./watch-types"

type WatchStart = {
	workspacePath: string
	sessionId: number
	ready?: Promise<void>
}

type WatchSession = {
	lease: WorkspaceWatchLease
	workspaceSessionId: number
	started: Promise<void>
}

export const createWorkspaceWatchRuntime = (
	deps: WorkspaceWatchDependencies,
) => {
	const reportError = deps.onError ?? ((error) => console.warn(error))
	let lifecycle = Promise.resolve()
	let current: WatchSession | null = null
	let active: { lease: WorkspaceWatchLease; unlisten: () => void } | null = null
	let disposed = false

	const enqueueLifecycle = (task: () => Promise<void>) => {
		const operation = lifecycle.then(task)
		lifecycle = operation.catch(() => {})
		return operation
	}

	const releaseActive = async () => {
		const previous = active
		active = null
		if (!previous) {
			return
		}
		try {
			previous.unlisten()
		} finally {
			deps.originJournal.clearWorkspace(previous.lease.workspacePath)
			await deps.watcher.stop(previous.lease)
		}
	}

	const createListener = (session: WatchSession, ready: Promise<void>) => {
		let queue = Promise.resolve()
		let streamId: string | null = null
		let lastSequence = 0
		const retiredStreams = new Set<string>()

		return (payload: VaultWatchBatchPayload) => {
			if (
				current !== session ||
				payload.workspacePath !== session.lease.workspacePath ||
				payload.sessionId !== session.lease.sessionId
			) {
				return
			}
			const { batch } = payload
			let newStream = false
			if (batch.streamId !== streamId) {
				if (retiredStreams.has(batch.streamId)) {
					return
				}
				if (streamId !== null) {
					retiredStreams.add(streamId)
					newStream = true
				}
				streamId = batch.streamId
				lastSequence = 0
			}
			if (batch.seqInStream <= lastSequence) {
				return
			}
			const requiresFullRefresh =
				newStream || batch.seqInStream !== lastSequence + 1
			lastSequence = batch.seqInStream

			queue = queue
				.then(async () => {
					await ready
					const isCurrent = () =>
						current === session && streamId === batch.streamId
					if (isCurrent()) {
						await applyWorkspaceWatchBatch(deps, payload, {
							isCurrent,
							requiresFullRefresh,
						})
					}
				})
				.catch(reportError)
		}
	}

	const start = ({ workspacePath, sessionId, ready }: WatchStart) => {
		if (disposed) {
			return Promise.reject(new Error("Workspace watcher is disposed"))
		}
		if (
			current?.workspaceSessionId === sessionId &&
			current.lease.workspacePath === workspacePath
		) {
			return current.started
		}

		const lease = { workspacePath, sessionId: crypto.randomUUID() }
		const session: WatchSession = {
			lease,
			workspaceSessionId: sessionId,
			started: Promise.resolve(),
		}
		current = session
		session.started = enqueueLifecycle(async () => {
			try {
				await releaseActive()
				if (current !== session) {
					return
				}
				const unlisten = await deps.watcher.subscribe(
					createListener(session, ready ?? Promise.resolve()),
				)
				if (current !== session) {
					unlisten()
					return
				}

				active = { lease, unlisten }
				await deps.watcher.start(lease)
			} catch (error) {
				if (current === session) {
					current = null
				}
				await releaseActive().catch(reportError)
				throw error
			}
		})
		return session.started
	}

	const stop = () => {
		current = null
		return enqueueLifecycle(releaseActive)
	}

	return {
		start,
		stop,
		dispose: () => {
			disposed = true
			return stop()
		},
	}
}
