import { Toaster } from "@mdit/ui/components/sonner"
import { PlateController } from "platejs/react"
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
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
				<Updater />
			</ThemeProvider>
		</ErrorBoundary>
	</React.StrictMode>,
)
