import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales"
import { toLocalePath } from "../../i18n/paths"

interface FooterProps {
	locale?: Locale
	transparent?: boolean
}

export function Footer({
	locale = DEFAULT_LOCALE,
	transparent = false,
}: FooterProps) {
	const termsPath = toLocalePath(locale, "/terms")
	const privacyPath = toLocalePath(locale, "/privacy")

	return (
		<footer className={transparent ? "" : "border-t border-border/40"}>
			<div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<a
						href={termsPath}
						className="hover:text-foreground transition-colors"
					>
						Terms of Service
					</a>
					<a
						href={privacyPath}
						className="hover:text-foreground transition-colors"
					>
						Privacy Policy
					</a>
					<a
						href="mailto:contact@mdit.app"
						className="hover:text-foreground transition-colors"
					>
						contact@mdit.app
					</a>
				</div>
			</div>
		</footer>
	)
}
