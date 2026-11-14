import { PlateController } from "@mdit/editor/plate"
import { Toaster } from "@mdit/ui/components/sonner"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import ReactDOM from "react-dom/client"
import { DndProvider } from "./components/dnd/dnd-provider"
import { ErrorBoundary } from "./components/error-boundary/error-boundary"
import { Hotkeys } from "./components/hotkeys/hotkeys"
import { Updater } from "./components/updater/updater"
import { WindowMenu } from "./components/window-menu/window-menu"
import { DropProvider } from "./contexts/drop-context"
import { ThemeProvider } from "./contexts/theme-context"
import { Router } from "./router"
import { getDesktopRuntime } from "./state/desktop-runtime"

const runtime = getDesktopRuntime()
runtime.start()

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			networkMode: "always",
			refetchOnWindowFocus: false,
			retry: false,
		},
	},
})

import.meta.hot?.dispose(() => {
	queryClient.clear()
})

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<ErrorBoundary>
				<ThemeProvider>
					<PlateController>
						<DropProvider>
							<DndProvider>
								<Router />
							</DndProvider>
						</DropProvider>
					</PlateController>
					<WindowMenu />
					<Hotkeys />
					<Toaster />
				</ThemeProvider>
			</ErrorBoundary>
			<Updater />
		</QueryClientProvider>
	</React.StrictMode>,
)
