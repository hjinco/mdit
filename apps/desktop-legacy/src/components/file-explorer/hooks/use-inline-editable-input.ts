import { useCallback, useEffect, useRef, useState } from "react"

type UseInlineEditableInputOptions = {
	active: boolean
	initialValue: string
	onSubmit: (trimmedValue: string) => void | Promise<void>
	onCancel: () => void
}

export function useInlineEditableInput({
	active,
	initialValue,
	onSubmit,
	onCancel,
}: UseInlineEditableInputOptions) {
	const [value, setValue] = useState(initialValue)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const hasSubmittedRef = useRef(false)

	useEffect(() => {
		if (active) {
			setValue(initialValue)
			hasSubmittedRef.current = false
			requestAnimationFrame(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			})
			return
		}

		hasSubmittedRef.current = false
	}, [active, initialValue])

	const submit = useCallback(async () => {
		if (hasSubmittedRef.current) {
			return
		}

		const trimmedValue = value.trim()
		if (!trimmedValue) {
			hasSubmittedRef.current = true
			onCancel()
			return
		}

		hasSubmittedRef.current = true
		await onSubmit(trimmedValue)
	}, [onCancel, onSubmit, value])

	const onKeyDown = useCallback(
		async (event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault()
				await submit()
			} else if (event.key === "Escape") {
				event.preventDefault()
				hasSubmittedRef.current = true
				onCancel()
			}
		},
		[onCancel, submit],
	)

	const onBlur = useCallback(async () => {
		await submit()
	}, [submit])

	return { value, setValue, inputRef, onKeyDown, onBlur }
}
