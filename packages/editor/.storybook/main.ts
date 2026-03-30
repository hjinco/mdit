import path from "node:path"
import { fileURLToPath } from "node:url"
import type { StorybookConfig } from "@storybook/react-vite"
import tailwindcss from "@tailwindcss/vite"
import { mergeConfig } from "vite"

const storybookDir = path.dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
	stories: ["../stories/**/*.stories.@(ts|tsx)"],
	addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	viteFinal: async (config) =>
		mergeConfig(config, {
			plugins: [tailwindcss()],
			resolve: {
				alias: {
					react: path.resolve(storybookDir, "../node_modules/react"),
					"react-dom": path.resolve(storybookDir, "../node_modules/react-dom"),
					"react/jsx-runtime": path.resolve(
						storybookDir,
						"../node_modules/react/jsx-runtime.js",
					),
				},
			},
		}),
}

export default config
