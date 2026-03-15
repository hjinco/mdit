import { WorkerEntrypoint } from "cloudflare:workers"
import { Hono } from "hono"
import { auth, verifyAuthorizationHeader } from "./lib/auth"

type AppEnv = {
	Bindings: Env
}

const app = new Hono<AppEnv>()

app.on(["POST", "GET"], "/api/*", (c) => auth.handler(c.req.raw))

export class AuthEntrypoint extends WorkerEntrypoint<Env> {
	verifySessionFromAuthorization(authorizationHeader: string | null) {
		return verifyAuthorizationHeader(authorizationHeader)
	}
}

export default app
