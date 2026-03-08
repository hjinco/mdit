import { toast } from "sonner"

export function reportImageImportFailure(path: string, error: unknown) {
	console.error("Failed to import image into workspace:", path, error)
	toast.error("Failed to import image into workspace.")
}
