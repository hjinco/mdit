import { Logo } from "@mdit/assets"
import { Button } from "@mdit/ui/components/button"
import { FolderOpenIcon } from "lucide-react"
import { motion } from "motion/react"
import { useStore } from "@/store"
import { isMac } from "@/utils/platform"

export function Welcome() {
	const openFolderPicker = useStore((state) => state.openFolderPicker)

	return (
		<div className="w-full h-screen flex flex-col bg-background selection:bg-primary/10">
			<div
				className="w-full h-10 shrink-0"
				{...(isMac() && { "data-tauri-drag-region": "" })}
			/>

			<div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
				<motion.div
					initial={{ opacity: 0, scale: 0.98 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{
						duration: 1.2,
						ease: [0.16, 1, 0.3, 1],
					}}
					className="max-w-sm w-full flex flex-col items-center"
				>
					<motion.div
						initial={{ opacity: 0, y: 15 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
						className="flex items-center gap-2 will-change-transform"
					>
						<div className="size-10 drop-shadow-xl">
							<Logo className="size-full" />
						</div>
						<h1 className="text-4xl font-bold tracking-tighter text-foreground">
							Mdit
						</h1>
					</motion.div>

					<div className="space-y-4 mt-8 mb-6">
						<motion.p
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								delay: 0.4,
								duration: 1.2,
								ease: [0.16, 1, 0.3, 1],
							}}
							className="text-muted-foreground text-base leading-relaxed max-w-[240px] mx-auto"
						>
							Write, organize, and think with simply better notes.
						</motion.p>
					</div>

					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
					>
						<Button
							variant="default"
							size="lg"
							className="h-11 px-8 rounded-full font-medium transition-all hover:bg-primary/90 hover:scale-102 active:scale-98 will-change-transform"
							onClick={openFolderPicker}
						>
							Open Folder
						</Button>
					</motion.div>
				</motion.div>
			</div>
		</div>
	)
}
