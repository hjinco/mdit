import { join } from "pathe"

export type GenerateUniqueFileNameResult = {
	fileName: string
	fullPath: string
}

export async function generateUniqueFileName(
	baseName: string,
	directoryPath: string,
	exists: (path: string) => Promise<boolean>,
): Promise<GenerateUniqueFileNameResult> {
	const extIndex = baseName.lastIndexOf(".")
	const hasExtension = extIndex > 0
	const baseNameWithoutExt = hasExtension
		? baseName.slice(0, extIndex)
		: baseName
	const extension = hasExtension ? baseName.slice(extIndex) : ""

	for (let attempt = 0; attempt <= 100; attempt += 1) {
		const suffix = attempt === 0 ? "" : ` ${attempt}`
		const fileName = `${baseNameWithoutExt}${suffix}${extension}`
		const fullPath = join(directoryPath, fileName)
		if (!(await exists(fullPath))) {
			return { fileName, fullPath }
		}
	}

	throw new Error("Unable to generate unique filename after 100 attempts")
}
