export const enDictionary = {
	nav: {
		blog: "Blog",
		download: "Download",
	},
	content: {
		blogTitle: "Blog",
		blogDescription: "Updates and writing from Mdit.",
		homeTitle: "Mdit",
		homeDescription: "Mdit website.",
	},
} as const

export type Dictionary = typeof enDictionary
