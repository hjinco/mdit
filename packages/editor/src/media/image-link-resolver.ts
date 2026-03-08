import type { ResolvedEditorImageLink } from "./image-insert"

export type EditorImageLinkResolver = (
	path: string,
) => ResolvedEditorImageLink | Promise<ResolvedEditorImageLink>

export type EditorImageLinkErrorHandler = (
	path: string,
	error: unknown,
) => void | Promise<void>

export type EditorImageLinkResolverHost = {
	resolveImageLink?: EditorImageLinkResolver
	onResolveImageLinkError?: EditorImageLinkErrorHandler
}

export async function notifyImageLinkResolveError(
	host: Pick<EditorImageLinkResolverHost, "onResolveImageLinkError">,
	path: string,
	error: unknown,
) {
	try {
		await host.onResolveImageLinkError?.(path, error)
	} catch {
		// Ignore host notification failures so image insertion stays isolated.
	}
}

export async function resolveEditorImageLink(
	path: string,
	host: EditorImageLinkResolverHost = {},
): Promise<ResolvedEditorImageLink | null> {
	if (!host.resolveImageLink) {
		return { url: path }
	}

	try {
		return await host.resolveImageLink(path)
	} catch (error) {
		await notifyImageLinkResolveError(host, path, error)
		return null
	}
}
