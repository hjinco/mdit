import { createFileRoute } from "@tanstack/react-router"
import { EmptyPageSection } from "../components/common/empty-page-section"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { ContentLayout } from "../layouts/ContentLayout"
import { buildPageHead } from "../lib/seo/head"

export const Route = createFileRoute("/404")({
	head: () =>
		buildPageHead({
			title: "Page Not Found | Mdit",
			description: "The page you requested does not exist.",
			canonicalPath: toLocalePath(DEFAULT_LOCALE, "/404"),
			noindex: true,
		}),
	component: ExplicitNotFound,
})

function ExplicitNotFound() {
	return (
		<ContentLayout>
			<EmptyPageSection />
		</ContentLayout>
	)
}
