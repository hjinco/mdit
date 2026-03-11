import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config"

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				miniflare: {
					serviceBindings: {
						AUTH_SERVICE: () =>
							new Response("AUTH_SERVICE test stub", {
								status: 501,
							}),
					},
				},
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
})
