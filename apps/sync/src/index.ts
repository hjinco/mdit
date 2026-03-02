import { DurableObject } from "cloudflare:workers"

export class MyDurableObject extends DurableObject<Env> {
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`
	}
}

export default {
	async fetch(_request, env, _ctx): Promise<Response> {
		const stub = env.MY_DURABLE_OBJECT.getByName("foo")
		const greeting = await stub.sayHello("world")

		return new Response(greeting)
	},
} satisfies ExportedHandler<Env>
