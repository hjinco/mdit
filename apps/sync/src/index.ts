import { auth } from "./lib/auth"

export default {
	async fetch(request, _env, _ctx): Promise<Response> {
		const url = new URL(request.url)
		if (url.pathname.startsWith("/api/auth")) {
			return auth.handler(request)
		}

		return new Response("Not found", { status: 404 })
	},
} satisfies ExportedHandler<Env>
