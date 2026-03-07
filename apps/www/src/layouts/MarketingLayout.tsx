import type { ReactNode } from "react"
import { Footer } from "../components/common/footer"
import { Header } from "../components/common/header"
import { DEFAULT_LOCALE, type Locale } from "../i18n/locales"
import { BaseLayout } from "./BaseLayout"

interface MarketingLayoutProps {
	children: ReactNode
	locale?: Locale
}

export function MarketingLayout({
	children,
	locale = DEFAULT_LOCALE,
}: MarketingLayoutProps) {
	return (
		<BaseLayout>
			<Header locale={locale} />
			{children}
			<Footer locale={locale} />
		</BaseLayout>
	)
}
