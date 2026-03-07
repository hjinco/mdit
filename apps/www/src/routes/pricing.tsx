import { createFileRoute } from "@tanstack/react-router"
import { EmptyPageSection } from "../components/common/empty-page-section"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { MarketingLayout } from "../layouts/MarketingLayout"
import { buildPageHead } from "../lib/seo/head"

export const Route = createFileRoute("/pricing")({
	head: () =>
		buildPageHead({
			title: "Pricing",
			description: "Simple and transparent pricing for Mdit.",
			canonicalPath: toLocalePath(DEFAULT_LOCALE, "/pricing"),
		}),
	component: Pricing,
})

function Pricing() {
	const locale = DEFAULT_LOCALE

	return (
		<MarketingLayout locale={locale}>
			<main className="px-4 pt-28 pb-10 sm:px-6">
				<EmptyPageSection className="mx-auto max-w-6xl min-h-[56vh]" />
			</main>
		</MarketingLayout>
	)
}
