export type ServiceScheduler = {
	every: (milliseconds: number, run: () => void) => () => void
	onFocus: (run: () => void) => () => void
	hasFocus: () => boolean
}

export const createBrowserServiceScheduler = (
	browserWindow: Window,
	document: Document,
): ServiceScheduler => ({
	every: (milliseconds, run) => {
		const timer = browserWindow.setInterval(run, milliseconds)
		return () => browserWindow.clearInterval(timer)
	},
	onFocus: (run) => {
		browserWindow.addEventListener("focus", run)
		return () => browserWindow.removeEventListener("focus", run)
	},
	hasFocus: () => document.hasFocus(),
})
