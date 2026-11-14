import { createContext, type ReactNode, useContext } from "react"

const EditorDropOwnershipContext = createContext(false)

export function EditorDropOwnershipProvider({
	children,
	isPointerInEditor,
}: {
	children: ReactNode
	isPointerInEditor: boolean
}) {
	return (
		<EditorDropOwnershipContext.Provider value={isPointerInEditor}>
			{children}
		</EditorDropOwnershipContext.Provider>
	)
}

export function useEditorDropOwnership() {
	return useContext(EditorDropOwnershipContext)
}
