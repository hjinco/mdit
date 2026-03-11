import { WorkerEntrypoint } from "cloudflare:workers"
import { Hono } from "hono"
import { auth, verifyAuthorizationHeader } from "./lib/auth"

const app = new Hono()

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw)
})

export class AuthEntrypoint extends WorkerEntrypoint<Env> {
	verifySessionFromAuthorization(authorizationHeader: string | null) {
		return verifyAuthorizationHeader(authorizationHeader)
	}
}

export default app
