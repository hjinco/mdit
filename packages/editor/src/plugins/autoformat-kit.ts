import { applyPreviousCodeBlockLanguage } from "@mdit/editor/utils/code-block-language"
import { KATEX_ENVIRONMENTS } from "@mdit/editor/utils/katex"
import type { AutoformatRule } from "@platejs/autoformat"
import {
	AutoformatPlugin,
	autoformatArrow,
	autoformatLegal,
	autoformatLegalHtml,
	autoformatMath,
	autoformatPunctuation,
	autoformatSmartQuotes,
} from "@platejs/autoformat"
import { insertEmptyCodeBlock } from "@platejs/code-block"
import { toggleList } from "@platejs/list"
import { insertInlineEquation } from "@platejs/math"
import { KEYS } from "platejs"

const WIKILINK_PLACEHOLDER = "Note"

const autoformatMarks: AutoformatRule[] = [
	{
		match: "***",
		mode: "mark",
		type: [KEYS.bold, KEYS.italic],
	},
	{
		match: "__*",
		mode: "mark",
		type: [KEYS.underline, KEYS.italic],
	},
	{
		match: "__**",
		mode: "mark",
		type: [KEYS.underline, KEYS.bold],
	},
	{
		match: "___***",
		mode: "mark",
		type: [KEYS.underline, KEYS.bold, KEYS.italic],
	},
	{
		match: "**",
		mode: "mark",
		type: KEYS.bold,
	},
	{
		match: "__",
		mode: "mark",
		type: KEYS.underline,
	},
	{
		match: "*",
		mode: "mark",
		type: KEYS.italic,
	},
	{
		match: "_",
		mode: "mark",
		type: KEYS.italic,
	},
	{
		match: "~~",
		mode: "mark",
		type: KEYS.strikethrough,
	},
	{
		match: "^",
		mode: "mark",
		type: KEYS.sup,
	},
	{
		match: "~",
		mode: "mark",
		type: KEYS.sub,
	},
	{
		match: "==",
		mode: "mark",
		type: KEYS.highlight,
	},
	{
		match: "≡",
		mode: "mark",
		type: KEYS.highlight,
	},
	{
		match: "`",
		mode: "mark",
		type: KEYS.code,
	},
]

const autoformatBlocks: AutoformatRule[] = [
	{
		match: "# ",
		mode: "block",
		type: KEYS.h1,
	},
	{
		match: "## ",
		mode: "block",
		type: KEYS.h2,
	},
	{
		match: "### ",
		mode: "block",
		type: KEYS.h3,
	},
	{
		match: "#### ",
		mode: "block",
		type: KEYS.h4,
	},
	{
		match: "##### ",
		mode: "block",
		type: KEYS.h5,
	},
	{
		match: "###### ",
		mode: "block",
		type: KEYS.h6,
	},
	{
		match: "> ",
		mode: "block",
		type: KEYS.blockquote,
	},
	{
		match: "```",
		mode: "block",
		type: KEYS.codeBlock,
		format: (editor) => {
			editor.tf.withoutNormalizing(() => {
				insertEmptyCodeBlock(editor, {
					defaultType: KEYS.p,
					insertNodesOptions: { select: true },
				})
				applyPreviousCodeBlockLanguage(editor)
			})
		},
	},
	// {
	//   match: '+ ',
	//   mode: 'block',
	//   preFormat: openNextToggles,
	//   type: KEYS.toggle,
	// },
	{
		match: ["---", "—-", "___ "],
		mode: "block",
		type: KEYS.hr,
		format: (editor) => {
			editor.tf.setNodes({ type: KEYS.hr })
			editor.tf.insertNodes({
				children: [{ text: "" }],
				type: KEYS.p,
			})
		},
	},
]

const autoformatLists: AutoformatRule[] = [
	{
		match: ["* ", "- "],
		mode: "block",
		type: "list",
		format: (editor) => {
			toggleList(editor, {
				listStyleType: KEYS.ul,
			})
		},
	},
	{
		match: [String.raw`^\d+\.$ `, String.raw`^\d+\)$ `],
		matchByRegex: true,
		mode: "block",
		type: "list",
		format: (editor, { matchString }) => {
			toggleList(editor, {
				listRestartPolite: Number(matchString) || 1,
				listStyleType: KEYS.ol,
			})
		},
	},
	{
		match: ["[] "],
		mode: "block",
		type: "list",
		format: (editor) => {
			editor.tf.withoutNormalizing(() => {
				// temporary fix
				editor.tf.setNodes({
					checked: undefined,
				})
				toggleList(editor, {
					listStyleType: KEYS.listTodo,
				})
				editor.tf.setNodes({
					checked: false,
				})
			})
		},
	},
	{
		match: ["[x] "],
		mode: "block",
		type: "list",
		format: (editor) => {
			editor.tf.withoutNormalizing(() => {
				// temporary fix
				editor.tf.setNodes({
					checked: undefined,
				})
				toggleList(editor, {
					listStyleType: KEYS.listTodo,
				})
				editor.tf.setNodes({
					checked: true,
				})
			})
		},
	},
]

const autoformatMathCustom: AutoformatRule[] = [
	{
		match: "$$",
		mode: "text",
		format: (editor) => {
			insertInlineEquation(editor, "", { select: true })
		},
	},
	...KATEX_ENVIRONMENTS.map(
		(environment): AutoformatRule => ({
			match: `\\begin{${environment}}`,
			mode: "block",
			type: KEYS.equation,
			format: (editor) => {
				editor.tf.setNodes({
					type: KEYS.equation,
					texExpression: "",
					environment,
				})
			},
		}),
	),
]

const autoformatWikiCustom: AutoformatRule[] = [
	{
		match: "[[",
		mode: "text",
		format: (editor) => {
			editor.tf.insertNodes(
				{
					type: KEYS.link,
					url: "",
					wiki: true,
					wikiTarget: "",
					children: [{ text: WIKILINK_PLACEHOLDER }],
				},
				{ select: true },
			)
		},
	},
]

export const AutoformatKit = [
	AutoformatPlugin.configure({
		options: {
			enableUndoOnDelete: true,
			rules: [
				...autoformatBlocks,
				...autoformatMarks,
				...autoformatSmartQuotes,
				...autoformatPunctuation,
				...autoformatLegal,
				...autoformatLegalHtml,
				...autoformatArrow,
				...autoformatMath,
				...autoformatMathCustom,
				...autoformatWikiCustom,
				...autoformatLists,
			].map(
				(rule): AutoformatRule => ({
					...rule,
					query: (editor) =>
						!editor.api.some({
							match: { type: editor.getType(KEYS.codeBlock) },
						}),
				}),
			),
		},
	}),
]
