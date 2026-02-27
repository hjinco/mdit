export function formatDate(date: Date, locale = "en-US"): string {
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(date)
}
