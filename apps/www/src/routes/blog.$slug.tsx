import { createFileRoute, notFound } from "@tanstack/react-router"
import { EmptyPageSection } from "../components/common/empty-page-section"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { toLocalePath } from "../i18n/paths"
import { ContentLayout } from "../layouts/ContentLayout"
import { getBlogPostBySlug } from "../lib/content/queries"
import { buildPageHead } from "../lib/seo/head"

export const Route = createFileRoute("/blog/$slug")({
	loader: ({ params }) => {
		const post = getBlogPostBySlug({
			slug: params.slug,
			locale: DEFAULT_LOCALE,
		})

		if (!post) {
			throw notFound()
		}

		return post
	},
	head: ({ loaderData }) => {
		if (!loaderData) {
			return buildPageHead()
		}

		return buildPageHead({
			title: `${loaderData.title} | Mdit Blog`,
			description: loaderData.description,
			canonicalPath: toLocalePath(
				loaderData.locale,
				`/blog/${loaderData.slug}`,
			),
		})
	},
	component: BlogPostPage,
})

function BlogPostPage() {
	const post = Route.useLoaderData()

	return (
		<ContentLayout locale={post.locale}>
			<EmptyPageSection />
		</ContentLayout>
	)
}
