import { getTableName } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { account, session, user, verification } from "./schema"

describe("auth schema", () => {
	it("exports the core Better Auth tables", () => {
		expect(getTableName(user)).toBe("user")
		expect(getTableName(session)).toBe("session")
		expect(getTableName(account)).toBe("account")
		expect(getTableName(verification)).toBe("verification")
	})
})
