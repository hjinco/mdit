const PORTABLE_INVALID_FILENAME_CHAR_REGEX = /[<>:"/\\|?*]/
const PORTABLE_TRAILING_DOTS_AND_SPACES_REGEX = /[. ]+$/g
const PORTABLE_WINDOWS_RESERVED_BASENAME_REGEX =
	/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const PORTABLE_INVALID_FILENAME_MESSAGE = "Name cannot be used as a file name."
const PORTABLE_EMPTY_FILENAME_MESSAGE = "Name cannot be empty."

function isPortableControlCharacter(char: string): boolean {
	const codePoint = char.codePointAt(0)
	return typeof codePoint === "number" && codePoint >= 0 && codePoint <= 31
}

function replacePortableInvalidCharacters(text: string): string {
	return Array.from(text, (char) =>
		PORTABLE_INVALID_FILENAME_CHAR_REGEX.test(char) ||
		isPortableControlCharacter(char)
			? " "
			: char,
	).join("")
}

function trimTrailingDotsAndSpaces(text: string): string {
	return text.replace(PORTABLE_TRAILING_DOTS_AND_SPACES_REGEX, "")
}

function splitExtension(name: string) {
	const lastDotIndex = name.lastIndexOf(".")
	return lastDotIndex > 0
		? {
				baseName: name.slice(0, lastDotIndex),
				extension: name.slice(lastDotIndex),
			}
		: {
				baseName: name,
				extension: "",
			}
}

function sanitizePortableNameCore(text: string): string {
	return trimTrailingDotsAndSpaces(replacePortableInvalidCharacters(text))
}

function normalizePortableBaseName(baseName: string): string {
	if (!baseName) {
		return ""
	}

	const firstDotIndex = baseName.indexOf(".")
	const reservedCandidate =
		firstDotIndex === -1 ? baseName : baseName.slice(0, firstDotIndex)

	if (!PORTABLE_WINDOWS_RESERVED_BASENAME_REGEX.test(reservedCandidate)) {
		return baseName
	}

	return firstDotIndex === -1
		? `${baseName}_`
		: `${reservedCandidate}_${baseName.slice(firstDotIndex)}`
}

export function sanitizePortableNoteStem(stem: string): string {
	return normalizePortableBaseName(sanitizePortableNameCore(stem))
}

export function sanitizePortableEntryName(name: string): string {
	const sanitizedName = sanitizePortableNameCore(name)
	if (!sanitizedName) {
		return ""
	}

	const { baseName, extension } = splitExtension(sanitizedName)
	const normalizedBaseName = normalizePortableBaseName(
		trimTrailingDotsAndSpaces(baseName),
	)

	if (!normalizedBaseName && !extension) {
		return ""
	}

	return `${normalizedBaseName}${extension}`
}

export function getPortableEntryNameValidationError(
	name: string,
): string | null {
	if (!name) {
		return PORTABLE_EMPTY_FILENAME_MESSAGE
	}

	const sanitizedName = sanitizePortableEntryName(name)
	if (!sanitizedName) {
		return PORTABLE_EMPTY_FILENAME_MESSAGE
	}

	return sanitizedName === name ? null : PORTABLE_INVALID_FILENAME_MESSAGE
}

export function getPortableNoteTitleValidationError(
	title: string,
	extension = ".md",
): string | null {
	if (!title) {
		return null
	}

	return getPortableEntryNameValidationError(`${title}${extension}`)
}
