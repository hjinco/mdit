import path from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const packageDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					environment: "node",
					exclude: ["stories/**", "e2e/**"],
					include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
					name: "unit",
				},
			},
			{
				plugins: [
					storybookTest({
						configDir: path.join(packageDir, ".storybook"),
						storybookScript: "pnpm storybook",
						storybookUrl: "http://127.0.0.1:4310",
					}),
				],
				test: {
					browser: {
						api: {
							host: "127.0.0.1",
						},
						enabled: true,
						headless: true,
						instances: [{ browser: "chromium" }],
						provider: playwright(),
					},
					name: "storybook",
				},
			},
		],
	},
})
