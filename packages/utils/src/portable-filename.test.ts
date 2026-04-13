import { describe, expect, it } from "vitest"
import {
	getPortableEntryNameValidationError,
	getPortableNoteTitleValidationError,
	sanitizePortableEntryName,
	sanitizePortableNoteStem,
} from "./portable-filename"

describe("portable-filename", () => {
	it("sanitizes portable note stems without collapsing internal spaces", () => {
		expect(sanitizePortableNoteStem('  Hello:/\\*?"<>|   World\t  ')).toBe(
			"  Hello            World",
		)
	})

	it("normalizes Windows reserved note stems to portable names", () => {
		expect(sanitizePortableNoteStem("CON")).toBe("CON_")
		expect(sanitizePortableNoteStem("nul")).toBe("nul_")
	})

	it("sanitizes full entry names while preserving the extension", () => {
		expect(sanitizePortableEntryName(" report:final?.md ")).toBe(
			" report final.md",
		)
	})

	it("normalizes Windows reserved basenames for entry names", () => {
		expect(sanitizePortableEntryName("AUX.md")).toBe("AUX_.md")
		expect(sanitizePortableEntryName("LPT1")).toBe("LPT1_")
		expect(sanitizePortableEntryName("CON.backup.md")).toBe("CON_.backup.md")
	})

	it("validates portable entry names without rewriting them", () => {
		expect(getPortableEntryNameValidationError("valid-name.md")).toBeNull()
		expect(getPortableEntryNameValidationError("CON.backup.md")).toBe(
			"Name cannot be used as a file name.",
		)
		expect(getPortableEntryNameValidationError("foo?.md")).toBe(
			"Name cannot be used as a file name.",
		)
	})

	it("validates note titles using the same filename rules as .md renames", () => {
		expect(getPortableNoteTitleValidationError("Valid title")).toBeNull()
		expect(getPortableNoteTitleValidationError("Client:Draft")).toBe(
			"Name cannot be used as a file name.",
		)
		expect(getPortableNoteTitleValidationError("CON")).toBe(
			"Name cannot be used as a file name.",
		)
	})
})
