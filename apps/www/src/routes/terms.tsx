import { createFileRoute, notFound } from "@tanstack/react-router"
import { RenderedMarkdown } from "../components/content/rendered-markdown"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { ContentLayout } from "../layouts/ContentLayout"
import { getLegalPageBySlug } from "../lib/content/queries"
import { buildPageHead } from "../lib/seo/head"

export const Route = createFileRoute("/terms")({
	loader: () => {
		const page = getLegalPageBySlug("terms", DEFAULT_LOCALE)

		if (!page) {
			throw notFound()
		}

		return page
	},
	head: ({ loaderData }) =>
		buildPageHead({
			title: `${loaderData?.title ?? "Terms of Service"} | Mdit`,
			description:
				loaderData?.description ?? "Terms for using Mdit software and website.",
			canonicalPath: toLocalePath(DEFAULT_LOCALE, "/terms"),
		}),
	component: Terms,
})

function Terms() {
	const page = Route.useLoaderData()

	return (
		<ContentLayout>
			<article className="max-w-3xl">
				<header className="mb-8 pb-6">
					<h1 className="mb-3 text-4xl font-semibold text-foreground/90">
						{page.title}
					</h1>
					<p className="text-muted-foreground">
						Effective date: {page.effectiveDate}
					</p>
				</header>
				<RenderedMarkdown html={page.html} />
			</article>
		</ContentLayout>
	)
}
