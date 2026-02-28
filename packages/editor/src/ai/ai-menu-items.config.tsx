import { AIChatPlugin, AIPlugin } from "@platejs/ai/react"
import {
	Album,
	Check,
	CornerUpLeft,
	FeatherIcon,
	ListMinus,
	ListPlus,
	PenLine,
	Wand,
	X,
} from "lucide-react"
import { NodeApi } from "platejs"
import type { PlateEditor } from "platejs/react"
import type { ReactNode } from "react"
import {
	DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP,
	type DefaultSelectionCommandTemplate,
} from "./ai-default-commands"
import type { EditorChatState } from "./ai-menu.types"

const improveWritingTemplate =
	DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP.improveWriting
const fixSpellingTemplate = DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP.fixSpelling
const makeLongerTemplate = DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP.makeLonger
const makeShorterTemplate = DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP.makeShorter
const simplifyLanguageTemplate =
	DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP.simplifyLanguage

type AIMenuItemActionArgs = {
	editor: PlateEditor
	input: string
}

export type AIMenuItem = {
	icon: ReactNode
	label: string
	value: string
	shortcut?: string
	onSelect: ({ editor, input }: AIMenuItemActionArgs) => void
}

type AIMenuItemGroup = {
	items: AIMenuItem[]
	heading?: string
}

const submitEditPrompt = (
	editor: PlateEditor,
	input: string,
	prompt: string,
) => {
	editor.getApi(AIChatPlugin).aiChat.submit(input, {
		prompt,
		toolName: "edit",
	})
}

const createSelectionEditItem = (
	icon: ReactNode,
	template: DefaultSelectionCommandTemplate,
): AIMenuItem => {
	return {
		icon,
		label: template.label,
		value: template.value,
		onSelect: ({ editor, input }) => {
			submitEditPrompt(editor, input, template.prompt)
		},
	}
}

const aiChatItems = {
	accept: {
		icon: <Check />,
		label: "Accept",
		value: "accept",
		onSelect: ({ editor }) => {
			editor.getTransforms(AIChatPlugin).aiChat.accept()
			editor.tf.focus({ edge: "end" })
		},
	},
	continueWrite: {
		icon: <PenLine />,
		label: "Continue writing",
		value: "continueWrite",
		onSelect: ({ editor, input }) => {
			const ancestorNode = editor.api.block({ highest: true })

			if (!ancestorNode) return

			const isEmpty = NodeApi.string(ancestorNode[0]).trim().length === 0

			editor.getApi(AIChatPlugin).aiChat.submit(input, {
				mode: "insert",
				toolName: "generate",
				prompt: isEmpty
					? `<Document>
{editor}
</Document>
Start writing a new paragraph AFTER <Document> ONLY ONE SENTENCE`
					: "Continue writing AFTER <Block> ONLY ONE SENTENCE. DONT REPEAT THE TEXT.",
			})
		},
	},
	discard: {
		icon: <X />,
		label: "Discard",
		shortcut: "Escape",
		value: "discard",
		onSelect: ({ editor }) => {
			editor.getTransforms(AIPlugin).ai.undo()
			editor.getApi(AIChatPlugin).aiChat.hide()
		},
	},
	fixSpelling: createSelectionEditItem(<Check />, fixSpellingTemplate),
	improveWriting: createSelectionEditItem(<Wand />, improveWritingTemplate),
	makeLonger: createSelectionEditItem(<ListPlus />, makeLongerTemplate),
	makeShorter: createSelectionEditItem(<ListMinus />, makeShorterTemplate),
	simplifyLanguage: createSelectionEditItem(
		<FeatherIcon />,
		simplifyLanguageTemplate,
	),
	summarize: {
		icon: <Album />,
		label: "Add a summary",
		value: "summarize",
		onSelect: ({ editor, input }) => {
			editor.getApi(AIChatPlugin).aiChat.submit(input, {
				mode: "insert",
				prompt: {
					default: "Summarize {editor}",
					selecting: "Summarize",
				},
				toolName: "generate",
			})
		},
	},
	tryAgain: {
		icon: <CornerUpLeft />,
		label: "Try again",
		value: "tryAgain",
		onSelect: ({ editor }) => {
			editor.getApi(AIChatPlugin).aiChat.reload()
		},
	},
} satisfies Record<string, AIMenuItem>

const menuStateItems: Record<EditorChatState, AIMenuItemGroup[]> = {
	cursorCommand: [
		{
			items: [aiChatItems.continueWrite, aiChatItems.summarize],
		},
	],
	cursorSuggestion: [
		{
			items: [aiChatItems.accept, aiChatItems.discard, aiChatItems.tryAgain],
		},
	],
	selectionCommand: [
		{
			items: [
				aiChatItems.improveWriting,
				aiChatItems.fixSpelling,
				aiChatItems.makeLonger,
				aiChatItems.makeShorter,
				aiChatItems.simplifyLanguage,
			],
		},
	],
}

export function getAIMenuItemGroups(
	menuState: EditorChatState,
): AIMenuItemGroup[] {
	return menuStateItems[menuState]
}
