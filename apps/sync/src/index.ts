import { Hono } from "hono"
import { syncRouter } from "./router"
import { SyncServiceError } from "./service"

type AppBindings = {
	Bindings: Env
}

const app = new Hono<AppBindings>()

app.onError((error, _c) => {
	if (error instanceof SyncServiceError) {
		return Response.json(error.body, {
			status: error.status,
		})
	}

	console.error(error)
	return Response.json(
		{ code: "INTERNAL_ERROR" },
		{
			status: 500,
		},
	)
})

app.route("/", syncRouter)

export default app
