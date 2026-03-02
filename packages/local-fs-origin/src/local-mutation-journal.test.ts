import { describe, expect, it } from "vitest"
import { createLocalMutationJournal } from "./local-mutation-journal"

describe("local-mutation-journal", () => {
	it("classifies exact target paths as local", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs/a.md", scope: "exact" }],
		})

		expect(
			journal.resolve({
				workspacePath: "/ws",
				relPaths: ["docs/a.md", "docs/b.md"],
			}),
		).toEqual({
			externalRelPaths: ["docs/b.md"],
			localRelPaths: ["docs/a.md"],
		})
	})

	it("classifies subtree target descendants as local", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs", scope: "subtree" }],
		})

		expect(
			journal.resolve({
				workspacePath: "/ws",
				relPaths: ["docs", "docs/a.md", "other/a.md"],
			}),
		).toEqual({
			externalRelPaths: ["other/a.md"],
			localRelPaths: ["docs", "docs/a.md"],
		})
	})

	it("expires local mutations after ttl", () => {
		let nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs/a.md", scope: "exact" }],
			ttlMs: 200,
		})

		nowMs = 1_201

		expect(
			journal.resolve({
				workspacePath: "/ws",
				relPaths: ["docs/a.md"],
			}),
		).toEqual({
			externalRelPaths: ["docs/a.md"],
			localRelPaths: [],
		})
	})

	it("keeps the longest ttl when the same path is registered repeatedly", () => {
		let nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs/a.md", scope: "exact" }],
			ttlMs: 500,
		})
		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs/a.md", scope: "exact" }],
			ttlMs: 100,
		})

		nowMs = 1_300

		expect(
			journal.resolve({
				workspacePath: "/ws",
				relPaths: ["docs/a.md"],
			}),
		).toEqual({
			externalRelPaths: [],
			localRelPaths: ["docs/a.md"],
		})
	})

	it("does not match mutations across workspaces", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws-a",
			targets: [{ path: "/ws-a/docs/a.md", scope: "exact" }],
		})

		expect(
			journal.resolve({
				workspacePath: "/ws-b",
				relPaths: ["docs/a.md"],
			}),
		).toEqual({
			externalRelPaths: ["docs/a.md"],
			localRelPaths: [],
		})
	})

	it("partitions mixed local and external paths", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws",
			targets: [{ path: "/ws/docs/a.md", scope: "exact" }],
		})

		expect(
			journal.resolve({
				workspacePath: "/ws",
				relPaths: ["docs/a.md", "docs/external.md", "images/pic.png"],
			}),
		).toEqual({
			externalRelPaths: ["docs/external.md", "images/pic.png"],
			localRelPaths: ["docs/a.md"],
		})
	})

	it("clearWorkspace removes entries only for that workspace", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "/ws-a",
			targets: [{ path: "/ws-a/docs/a.md", scope: "exact" }],
		})
		journal.register({
			workspacePath: "/ws-b",
			targets: [{ path: "/ws-b/docs/b.md", scope: "exact" }],
		})

		journal.clearWorkspace("/ws-a")

		expect(
			journal.resolve({
				workspacePath: "/ws-a",
				relPaths: ["docs/a.md"],
			}),
		).toEqual({
			externalRelPaths: ["docs/a.md"],
			localRelPaths: [],
		})

		expect(
			journal.resolve({
				workspacePath: "/ws-b",
				relPaths: ["docs/b.md"],
			}),
		).toEqual({
			externalRelPaths: [],
			localRelPaths: ["docs/b.md"],
		})
	})

	it("normalizes Windows drive-root workspace paths", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "C:\\",
			targets: [{ path: "C:\\docs\\a.md", scope: "exact" }],
		})

		expect(
			journal.resolve({
				workspacePath: "c:/",
				relPaths: ["docs\\a.md", "docs\\b.md"],
			}),
		).toEqual({
			externalRelPaths: ["docs\\b.md"],
			localRelPaths: ["docs\\a.md"],
		})
	})

	it("matches Windows paths regardless of case", () => {
		const nowMs = 1_000
		const journal = createLocalMutationJournal({ now: () => nowMs })

		journal.register({
			workspacePath: "C:\\Vault",
			targets: [{ path: "C:\\Vault\\Docs\\Note.md", scope: "exact" }],
		})

		expect(
			journal.resolve({
				workspacePath: "c:/vault",
				relPaths: ["docs/note.md"],
			}),
		).toEqual({
			externalRelPaths: [],
			localRelPaths: ["docs/note.md"],
		})
	})
})
