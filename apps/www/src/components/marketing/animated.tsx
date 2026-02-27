import { motion } from "motion/react"
import type { ReactNode } from "react"

interface AnimatedProps {
	children: ReactNode
	className?: string
	as?: "h1" | "h2" | "h3" | "p" | "span" | "div"
	delay?: number
	duration?: number
	disableY?: boolean
}

const motionComponents = {
	h1: motion.h1,
	h2: motion.h2,
	h3: motion.h3,
	p: motion.p,
	span: motion.span,
	div: motion.div,
}

export function Animated({
	children,
	className = "",
	as = "div",
	delay = 0,
	duration = 0.5,
	disableY = false,
}: AnimatedProps) {
	const MotionComponent = motionComponents[as]

	const initial = disableY
		? { opacity: 0, filter: "blur(10px)" }
		: { opacity: 0, y: 20, filter: "blur(10px)" }

	const whileInView = disableY
		? { opacity: 1, filter: "blur(0px)" }
		: { opacity: 1, y: 0, filter: "blur(0px)" }

	return (
		<MotionComponent
			initial={initial}
			whileInView={whileInView}
			viewport={{ once: true, margin: "-50px" }}
			transition={{ duration, delay, ease: "easeOut" }}
			className={className}
		>
			{children}
		</MotionComponent>
	)
}
