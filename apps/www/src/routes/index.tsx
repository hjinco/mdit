import { createFileRoute } from "@tanstack/react-router"
import { EmptyPageSection } from "../components/common/empty-page-section"
import { getDictionary } from "../i18n/get-dictionary"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { MarketingLayout } from "../layouts/MarketingLayout"
import { buildPageHead } from "../lib/seo/head"
import { SITE_TITLE } from "../lib/site/consts"

export const Route = createFileRoute("/")({
	head: () => {
		const locale = DEFAULT_LOCALE
		const dictionary = getDictionary(locale)

		return buildPageHead({
			title: `${dictionary.content.homeTitle} | ${SITE_TITLE}`,
			description: dictionary.content.homeDescription,
			canonicalPath: toLocalePath(locale, "/"),
		})
	},
	component: Home,
})

function Home() {
	return (
		<MarketingLayout locale={DEFAULT_LOCALE}>
			<main className="px-4 pt-28 pb-10 sm:px-6">
				<EmptyPageSection className="mx-auto max-w-6xl min-h-[56vh]" />
			</main>
		</MarketingLayout>
	)
}
