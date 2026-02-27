export const enDictionary = {
	nav: {
		pricing: "Pricing",
		blog: "Blog",
		changelog: "Changelog",
		download: "Download",
	},
	content: {
		blogTitle: "Blog",
		blogDescription: "Product stories, tips, and release updates.",
		changelogTitle: "Changelog",
		changelogDescription: "What changed in Mdit, sorted by date.",
	},
} as const

export type Dictionary = typeof enDictionary
