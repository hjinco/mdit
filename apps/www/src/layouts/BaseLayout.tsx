import type { ReactNode } from "react"

interface BaseLayoutProps {
	children: ReactNode
	bodyClass?: string
}

export function BaseLayout({
	children,
	bodyClass = "m-0 w-full h-full font-sans bg-white text-neutral-800 antialiased",
}: BaseLayoutProps) {
	return <div className={bodyClass}>{children}</div>
}
