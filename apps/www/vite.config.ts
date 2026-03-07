import { cloudflare } from "@cloudflare/vite-plugin"
import contentCollections from "@content-collections/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tsConfigPaths from "vite-tsconfig-paths"

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		tailwindcss(),
		tsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		contentCollections({ configPath: "./content-collections.ts" }),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tanstackStart({
			prerender: {
				enabled: true,
				autoSubfolderIndex: true,
				autoStaticPathsDiscovery: true,
				crawlLinks: true,
				failOnError: true,
			},
			pages: [
				{ path: "/", prerender: { enabled: true } },
				{ path: "/pricing", prerender: { enabled: true } },
				{ path: "/privacy", prerender: { enabled: true } },
				{ path: "/terms", prerender: { enabled: true } },
				{ path: "/blog", prerender: { enabled: true } },
				{ path: "/404", prerender: { enabled: true } },
			],
		}),
		viteReact(),
	],
})
