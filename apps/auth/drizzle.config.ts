import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "drizzle-kit"

function getLocalD1DB() {
	try {
		const basePath = path.resolve(".wrangler/state/v3/d1")
		const dbFile = fs
			.readdirSync(basePath, { encoding: "utf-8", recursive: true })
			.find((file) => file.endsWith(".sqlite"))

		if (!dbFile) {
			throw new Error(`.sqlite file not found in ${basePath}`)
		}

		return path.resolve(basePath, dbFile)
	} catch (error) {
		console.log(error)
	}
}

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./migrations",
	dbCredentials: {
		url: getLocalD1DB() ?? "",
	},
})
