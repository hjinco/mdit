import { Hono } from "hono"

type AppBindings = {
	Bindings: Env
}

const app = new Hono<AppBindings>()

export default app
