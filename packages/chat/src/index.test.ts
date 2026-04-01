import { describe, expect, it } from "vitest"
import { Chat, createPanelChatTools, useChat } from "./index"

describe("@mdit/chat exports", () => {
	it("exports Chat component, useChat hook, and panel tool factory", () => {
		expect(typeof Chat).toBe("function")
		expect(typeof useChat).toBe("function")
		expect(typeof createPanelChatTools).toBe("function")
	})
})
