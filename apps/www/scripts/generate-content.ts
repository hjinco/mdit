import { createBuilder } from "@content-collections/core"

const builder = await createBuilder("content-collections.ts")

builder.on("_error", ({ error }) => {
	console.error(error)
	process.exitCode = 1
})

await builder.build()
