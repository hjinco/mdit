import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Send,
} from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  isDetailsExpanded: boolean
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
      isDetailsExpanded: false,
      isSending: false,
      isSent: false,
      sendError: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  formatErrorReport = () => {
    const { error, errorInfo } = this.state
    const timestamp = new Date().toISOString()
    const appVersion = '0.0.0' // from package.json
    const userAgent = navigator.userAgent
    const platform = navigator.platform

    return {
      timestamp,
      appVersion,
      platform,
      userAgent,
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace available',
      componentStack:
        errorInfo?.componentStack || 'No component stack available',
    }
  }

  handleSendError = async () => {
    this.setState({ isSending: true, sendError: null })

    const errorReport = this.formatErrorReport()

    try {
      const response = await fetch('https://api.mdit.app/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorReport),
      })

      if (!response.ok) {
        throw new Error(`Failed to send error report: ${response.statusText}`)
      }

      this.setState({ isSending: false, isSent: true })

      setTimeout(() => {
        this.setState({ isSent: false })
      }, 3000)
    } catch (err) {
      console.error('Failed to send error report:', err)
      this.setState({
        isSending: false,
        sendError:
          err instanceof Error ? err.message : 'Failed to send error report',
      })
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  toggleDetails = () => {
    this.setState((prev) => ({
      isDetailsExpanded: !prev.isDetailsExpanded,
    }))
  }

  render() {
    if (this.state.hasError) {
      const {
        error,
        errorInfo,
        isDetailsExpanded,
        isSending,
        isSent,
        sendError,
      } = this.state

      return (
        <div className="h-screen w-full flex items-center justify-center bg-background p-12 overflow-auto">
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
                    occurred. You can send the error report to help us fix this
                    issue.
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
                    ? 'Sending...'
                    : isSent
                      ? 'Sent!'
                      : 'Send Error Report'}
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

              <div className="border border-border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="w-full px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm font-medium text-foreground"
                >
                  <span>View Technical Details</span>
                  {isDetailsExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                <div
                  className={cn(
                    'overflow-hidden transition-all duration-200',
                    isDetailsExpanded ? 'max-h-[600px]' : 'max-h-0'
                  )}
                >
                  <div className="p-4 bg-background/50 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-foreground/70 mb-2">
                        Error Message
                      </p>
                      <p className="text-xs text-muted-foreground font-mono break-words bg-muted/50 p-3 rounded">
                        {error?.message || 'Unknown error occurred'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-foreground/70 mb-2">
                        Stack Trace
                      </p>
                      <div className="overflow-auto max-h-60 bg-muted/50 p-3 rounded">
                        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                          {error?.stack || 'No stack trace available'}
                        </pre>
                      </div>
                    </div>

                    {errorInfo?.componentStack && (
                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Component Stack
                        </p>
                        <div className="overflow-auto max-h-40 bg-muted/50 p-3 rounded">
                          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                            {errorInfo.componentStack}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground text-center">
                  Sending the error report helps us identify and fix issues
                  faster.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
