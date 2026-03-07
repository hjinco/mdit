import type { ReactNode } from "react"
import { Footer } from "../components/common/footer"
import { Header } from "../components/common/header"
import { DEFAULT_LOCALE, type Locale } from "../i18n/locales"
import { BaseLayout } from "./BaseLayout"

interface ContentLayoutProps {
	children: ReactNode
	locale?: Locale
	containerClass?: string
}

export function ContentLayout({
	children,
	locale = DEFAULT_LOCALE,
	containerClass = "max-w-3xl mx-auto px-4",
}: ContentLayoutProps) {
	return (
		<BaseLayout>
			<Header locale={locale} />
			<main className="pt-28 pb-10">
				<div className={containerClass}>{children}</div>
			</main>
			<Footer locale={locale} />
		</BaseLayout>
	)
}
