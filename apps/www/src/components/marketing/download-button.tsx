import type { ReactNode } from "react"

// A simple utility to merge classNames conditionally
function cn(...classes: (string | undefined)[]) {
	return classes.filter(Boolean).join(" ")
}

const DEFAULT_DOWNLOAD_URL = "https://github.com/hjinco/mdit/releases/latest"

interface DownloadButtonProps {
	variant?: "default" | "secondary" | "outline"
	size?: "sm" | "default" | "lg"
	className?: string
	children: ReactNode
	href?: string
}

export function DownloadButton({
	variant = "default",
	size = "lg",
	className,
	children,
	href = DEFAULT_DOWNLOAD_URL,
}: DownloadButtonProps) {
	const baseStyles =
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer active:scale-[0.98]"

	const variants = {
		default: "bg-[#1A1A1A] text-white hover:bg-black",
		secondary:
			"bg-white text-[#1A1A1A] border border-neutral-200 shadow-xs hover:bg-neutral-50",
		outline:
			"bg-transparent text-[#1A1A1A] border border-neutral-200 hover:bg-neutral-100",
	}

	const sizes = {
		default: "h-10 px-4 py-2 text-sm",
		sm: "h-9 rounded-md px-3 text-sm",
		lg: "h-12 rounded-xl px-8 text-base",
	}

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(baseStyles, variants[variant], sizes[size], className)}
		>
			{children}
		</a>
	)
}
