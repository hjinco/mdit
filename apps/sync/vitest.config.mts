import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				serviceBindings: {
					AUTH_SERVICE: () =>
						new Response("AUTH_SERVICE test stub", {
							status: 501,
						}),
				},
			},
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
})
