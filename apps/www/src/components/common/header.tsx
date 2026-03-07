import iconUrl from "../../assets/icon.svg"
import { getDictionary } from "../../i18n/get-dictionary"
import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales"
import { toLocalePath } from "../../i18n/paths"
import { DOWNLOAD_URL } from "../../lib/site/consts"
import { DownloadButton } from "../marketing/download-button"

interface HeaderProps {
	locale?: Locale
	transparent?: boolean
}

export function Header({
	locale = DEFAULT_LOCALE,
	transparent = false,
}: HeaderProps) {
	const dictionary = getDictionary(locale)
	const homePath = toLocalePath(locale, "/")
	const blogPath = toLocalePath(locale, "/blog")

	return (
		<header
			className={`fixed inset-x-0 top-0 z-1000 ${
				transparent
					? "bg-transparent"
					: "border-b border-border/40 bg-background/90 backdrop-blur-md"
			}`}
		>
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
				<a
					href={homePath}
					className="flex items-center gap-2 text-xl font-medium tracking-tight text-foreground/80 no-underline md:text-2xl"
				>
					<img
						src={iconUrl}
						alt="Mdit"
						className="w-5 h-5 md:w-6 md:h-6 shrink-0"
					/>
					Mdit
				</a>

				<div className="flex items-center gap-3 sm:gap-4">
					<nav className="flex items-center gap-5 text-sm font-medium text-foreground/65">
						<a
							href={blogPath}
							className="transition-colors hover:text-foreground"
						>
							{dictionary.nav.blog}
						</a>
					</nav>
					<DownloadButton
						href={DOWNLOAD_URL}
						size="sm"
						className="rounded-sm px-4"
					>
						{dictionary.nav.download}
					</DownloadButton>
				</div>
			</div>
		</header>
	)
}
