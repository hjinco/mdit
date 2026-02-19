import { AlertCircle, RotateCcw, Send } from "lucide-react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { isMac } from "@/utils/platform"

interface ErrorBoundaryProps {
	children: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
	isSending: boolean
	isSent: boolean
	sendError: string | null
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			isSending: false,
			isSent: false,
			sendError: null,
		}
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo)
		this.setState({ errorInfo })
	}

	formatErrorReport = (): string => {
		const { error, errorInfo } = this.state
		const timestamp = new Date().toISOString()
		const appVersion = "0.0.0" // from package.json
		const userAgent = navigator.userAgent
		const platform = navigator.platform

		const errorMessage = error?.message || "Unknown error"
		const stackTrace = error?.stack || "No stack trace available"
		const componentStack =
			errorInfo?.componentStack || "No component stack available"

		return `Error Report
=============

Timestamp: ${timestamp}
App Version: ${appVersion}
Platform: ${platform}
User Agent: ${userAgent}

Error Message:
${errorMessage}

Stack Trace:
${stackTrace}

Component Stack:
${componentStack}`
	}

	handleSendError = async () => {
		const apiUrl = import.meta.env.VITE_FEEDBACK_API_URL
		if (!apiUrl) {
			this.setState({
				sendError: "Feedback API URL is not configured",
			})
			return
		}

		this.setState({ isSending: true, sendError: null })

		const errorReportMessage = this.formatErrorReport()

		try {
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: errorReportMessage,
				}),
			})

			if (!response.ok) {
				throw new Error(`Failed to send error report: ${response.statusText}`)
			}

			this.setState({ isSending: false, isSent: true })

			setTimeout(() => {
				this.setState({ isSent: false })
			}, 3000)
		} catch (err) {
			console.error("Failed to send error report:", err)
			this.setState({
				isSending: false,
				sendError:
					err instanceof Error ? err.message : "Failed to send error report",
			})
		}
	}

	handleReload = () => {
		window.location.reload()
	}

	render() {
		if (this.state.hasError) {
			const { isSending, isSent, sendError } = this.state

			return (
				<div className="h-screen w-full flex flex-col bg-background overflow-auto">
					<div
						className="w-full h-12"
						{...(isMac() && { "data-tauri-drag-region": "" })}
					/>
					<div className="flex-1 flex items-center justify-center p-12">
						<div className="max-w-2xl w-full my-auto">
							<div className="bg-card rounded-lg border border-border shadow-sm p-8 space-y-6">
								<div className="flex items-start gap-4">
									<div className="flex-shrink-0 mt-1">
										<div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
											<AlertCircle className="w-6 h-6 text-destructive" />
										</div>
									</div>
									<div className="flex-1 space-y-2">
										<h1 className="text-2xl font-semibold text-foreground">
											Something went wrong
										</h1>
										<p className="text-muted-foreground text-sm leading-relaxed">
											We're sorry for the inconvenience. An unexpected error
											occurred. Would you like to send an error report so we can
											fix this?
										</p>
									</div>
								</div>

								<div className="flex items-center gap-3">
									<Button
										onClick={this.handleSendError}
										variant="default"
										className="flex-1"
										disabled={isSending || isSent}
									>
										<Send className="w-4 h-4" />
										{isSending
											? "Sending..."
											: isSent
												? "Sent!"
												: "Send Error Report"}
									</Button>
									<Button
										onClick={this.handleReload}
										variant="outline"
										className="flex-1"
									>
										<RotateCcw className="w-4 h-4" />
										Reload App
									</Button>
								</div>

								{sendError && (
									<div className="bg-destructive/10 rounded-md p-3 border border-destructive/20">
										<p className="text-sm text-destructive">{sendError}</p>
									</div>
								)}

								{isSent && (
									<div className="bg-green-500/10 rounded-md p-3 border border-green-500/20">
										<p className="text-sm text-green-600 dark:text-green-400">
											Error report sent successfully. Thank you for helping us
											improve!
										</p>
									</div>
								)}

								<div className="pt-2 border-t border-border">
									<p className="text-xs text-muted-foreground text-center">
										Sending the error report helps us identify and fix issues
										faster.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			)
		}

		return this.props.children
	}
}
