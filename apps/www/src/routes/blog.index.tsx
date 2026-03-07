import { createFileRoute } from "@tanstack/react-router"
import { EmptyPageSection } from "../components/common/empty-page-section"
import { getDictionary } from "../i18n/get-dictionary"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { ContentLayout } from "../layouts/ContentLayout"
import { buildPageHead } from "../lib/seo/head"

export const Route = createFileRoute("/blog/")({
	head: () => {
		const locale = DEFAULT_LOCALE
		const dictionary = getDictionary(locale)

		return buildPageHead({
			title: `${dictionary.content.blogTitle} | Mdit`,
			description: dictionary.content.blogDescription,
			canonicalPath: toLocalePath(locale, "/blog"),
		})
	},
	component: BlogIndex,
})

function BlogIndex() {
	return (
		<ContentLayout locale={DEFAULT_LOCALE}>
			<EmptyPageSection />
		</ContentLayout>
	)
}
