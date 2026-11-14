const WORDS_PER_MINUTE = 300

export const calculateReadingMinutes = (
	words: number,
	wordsPerMinute = WORDS_PER_MINUTE,
) => {
	if (words === 0) {
		return 0
	}

	return Math.max(1, Math.round(words / wordsPerMinute))
}
