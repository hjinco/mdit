import { getModifierKey } from "@/utils/keyboard-shortcut"

export type AppHotkeyActionId =
	| "create-note"
	| "open-folder"
	| "open-command-menu"
	| "toggle-graph-view"
	| "toggle-file-explorer"
	| "toggle-collection-view"
	| "zoom-in"
	| "zoom-out"
	| "reset-zoom"
	| "go-back"
	| "go-forward"
	| "toggle-settings"

export type AppHotkeyCategory = "file" | "view" | "history" | "app"

export type AppHotkeyDefinition = {
	id: AppHotkeyActionId
	label: string
	category: AppHotkeyCategory
	defaultBinding: string
}

export type AppHotkeyMap = Record<AppHotkeyActionId, string>

export const APP_HOTKEY_DEFINITIONS: readonly AppHotkeyDefinition[] = [
	{
		id: "create-note",
		label: "New Note",
		category: "file",
		defaultBinding: "Mod+N",
	},
	{
		id: "open-folder",
		label: "Open Folder",
		category: "file",
		defaultBinding: "Mod+O",
	},
	{
		id: "open-command-menu",
		label: "Command Menu",
		category: "view",
		defaultBinding: "Mod+K",
	},
	{
		id: "toggle-graph-view",
		label: "Graph View",
		category: "view",
		defaultBinding: "Mod+G",
	},
	{
		id: "toggle-file-explorer",
		label: "Toggle File Explorer",
		category: "view",
		defaultBinding: "Mod+S",
	},
	{
		id: "toggle-collection-view",
		label: "Toggle Collection View",
		category: "view",
		defaultBinding: "Mod+D",
	},
	{
		id: "zoom-in",
		label: "Zoom In",
		category: "view",
		defaultBinding: "Mod+=",
	},
	{
		id: "zoom-out",
		label: "Zoom Out",
		category: "view",
		defaultBinding: "Mod+-",
	},
	{
		id: "reset-zoom",
		label: "Reset Zoom",
		category: "view",
		defaultBinding: "Mod+0",
	},
	{
		id: "go-back",
		label: "Go Back",
		category: "history",
		defaultBinding: "Mod+[",
	},
	{
		id: "go-forward",
		label: "Go Forward",
		category: "history",
		defaultBinding: "Mod+]",
	},
	{
		id: "toggle-settings",
		label: "Toggle Settings",
		category: "app",
		defaultBinding: "Mod+,",
	},
] as const

const APP_HOTKEY_ACTION_ID_SET = new Set<AppHotkeyActionId>(
	APP_HOTKEY_DEFINITIONS.map((definition) => definition.id),
)

const MODIFIER_ALIASES: Record<string, "Mod" | "Ctrl" | "Alt" | "Shift"> = {
	mod: "Mod",
	cmd: "Mod",
	command: "Mod",
	meta: "Mod",
	cmdorctrl: "Mod",
	control: "Ctrl",
	ctrl: "Ctrl",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
}

const MODIFIER_ORDER = ["Mod", "Ctrl", "Alt", "Shift"] as const

export const DEFAULT_APP_HOTKEYS: AppHotkeyMap =
	APP_HOTKEY_DEFINITIONS.reduce<AppHotkeyMap>((acc, definition) => {
		acc[definition.id] = definition.defaultBinding
		return acc
	}, {} as AppHotkeyMap)

export const APP_HOTKEY_CATEGORY_LABELS: Record<AppHotkeyCategory, string> = {
	file: "File",
	view: "View",
	history: "History",
	app: "App",
}

export function createDefaultAppHotkeys(): AppHotkeyMap {
	return { ...DEFAULT_APP_HOTKEYS }
}

export function isAppHotkeyActionId(
	value: unknown,
): value is AppHotkeyActionId {
	return (
		typeof value === "string" &&
		APP_HOTKEY_ACTION_ID_SET.has(value as AppHotkeyActionId)
	)
}

export function normalizeHotkeyBinding(binding: string): string {
	const trimmed = binding.trim()
	if (!trimmed) {
		return ""
	}

	const parts = trimmed
		.split("+")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)

	if (parts.length === 0) {
		return ""
	}

	const normalizedParts = parts.map((part) => normalizeHotkeyPart(part))
	const key = normalizedParts[normalizedParts.length - 1]
	const modifierSet = new Set<string>()

	for (const part of normalizedParts.slice(0, -1)) {
		if (isModifier(part)) {
			modifierSet.add(part)
		}
	}

	const orderedModifiers = MODIFIER_ORDER.filter((modifier) =>
		modifierSet.has(modifier),
	)

	return [...orderedModifiers, key].join("+")
}

export function mergeWithDefaultHotkeys(
	bindings: Partial<Record<AppHotkeyActionId, unknown>> | null | undefined,
): AppHotkeyMap {
	const merged = createDefaultAppHotkeys()
	if (!bindings) {
		return merged
	}

	for (const definition of APP_HOTKEY_DEFINITIONS) {
		const value = bindings[definition.id]
		if (typeof value !== "string") {
			continue
		}
		merged[definition.id] = normalizeHotkeyBinding(value)
	}

	return merged
}

export function findHotkeyConflict(
	bindings: AppHotkeyMap,
	actionId: AppHotkeyActionId,
	candidateBinding: string,
): AppHotkeyActionId | null {
	if (!candidateBinding) {
		return null
	}

	for (const definition of APP_HOTKEY_DEFINITIONS) {
		if (definition.id === actionId) {
			continue
		}
		if (bindings[definition.id] === candidateBinding) {
			return definition.id
		}
	}

	return null
}

export function hotkeyToDisplayTokens(binding: string): string[] {
	const normalizedBinding = normalizeHotkeyBinding(binding)
	if (!normalizedBinding) {
		return []
	}

	return normalizedBinding.split("+").map((token) => {
		if (token === "Mod") {
			return getModifierKey()
		}
		return token
	})
}

export function hotkeyToMenuAccelerator(binding: string): string | undefined {
	const normalizedBinding = normalizeHotkeyBinding(binding)
	if (!normalizedBinding) {
		return undefined
	}

	return normalizedBinding
		.split("+")
		.map((token) => (token === "Mod" ? "CmdOrCtrl" : token))
		.join("+")
}

function normalizeHotkeyPart(part: string): string {
	const alias = MODIFIER_ALIASES[part.toLowerCase()]
	if (alias) {
		return alias
	}

	if (part.length === 1 && /[a-z]/i.test(part)) {
		return part.toUpperCase()
	}

	return part
}

function isModifier(part: string): part is (typeof MODIFIER_ORDER)[number] {
	return MODIFIER_ORDER.includes(part as (typeof MODIFIER_ORDER)[number])
}
