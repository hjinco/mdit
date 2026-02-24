import { Button } from "@mdit/ui/components/button"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import {
	IconCircleFilled,
	IconRefresh,
	IconSquareFilled,
} from "@tabler/icons-react"
import { useHotkeyRecorder } from "@tanstack/react-hotkeys"
import { useCallback, useMemo, useState } from "react"
import { useShallow } from "zustand/shallow"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import {
	APP_HOTKEY_CATEGORY_LABELS,
	APP_HOTKEY_DEFINITIONS,
	type AppHotkeyActionId,
	type AppHotkeyCategory,
} from "@/lib/hotkeys"
import { useStore } from "@/store"

const HOTKEY_LABEL_BY_ID: Record<AppHotkeyActionId, string> =
	APP_HOTKEY_DEFINITIONS.reduce(
		(acc, definition) => {
			acc[definition.id] = definition.label
			return acc
		},
		{} as Record<AppHotkeyActionId, string>,
	)

const CATEGORY_ORDER: AppHotkeyCategory[] = ["file", "view", "history", "app"]

export function HotkeysTab() {
	const { hotkeys, setHotkeyBinding, resetHotkeyBindings } = useStore(
		useShallow((state) => ({
			hotkeys: state.hotkeys,
			setHotkeyBinding: state.setHotkeyBinding,
			resetHotkeyBindings: state.resetHotkeyBindings,
		})),
	)

	const [recordingActionId, setRecordingActionId] =
		useState<AppHotkeyActionId | null>(null)
	const [errors, setErrors] = useState<
		Partial<Record<AppHotkeyActionId, string>>
	>({})

	const groupedDefinitions = useMemo(
		() =>
			CATEGORY_ORDER.map((category) => ({
				category,
				definitions: APP_HOTKEY_DEFINITIONS.filter(
					(definition) => definition.category === category,
				),
			})).filter((group) => group.definitions.length > 0),
		[],
	)

	const saveBinding = useCallback(
		async (actionId: AppHotkeyActionId, binding: string) => {
			const result = await setHotkeyBinding(actionId, binding)
			if (result.success) {
				setErrors((prev) => {
					const next = { ...prev }
					delete next[actionId]
					return next
				})
				return
			}

			const conflictLabel = result.conflictWith
				? HOTKEY_LABEL_BY_ID[result.conflictWith]
				: null
			setErrors((prev) => ({
				...prev,
				[actionId]: conflictLabel
					? `Already assigned to ${conflictLabel}`
					: (result.error ?? "Failed to update shortcut"),
			}))
		},
		[setHotkeyBinding],
	)

	const recorder = useHotkeyRecorder({
		onRecord: (binding) => {
			if (!recordingActionId) {
				return
			}
			const targetActionId = recordingActionId
			setRecordingActionId(null)
			void saveBinding(targetActionId, binding)
		},
		onCancel: () => {
			setRecordingActionId(null)
		},
	})

	const startRecording = (actionId: AppHotkeyActionId) => {
		if (recorder.isRecording) {
			recorder.cancelRecording()
		}
		setRecordingActionId(actionId)
		recorder.startRecording()
	}

	const cancelRecording = () => {
		recorder.cancelRecording()
		setRecordingActionId(null)
	}

	const restoreDefaultBinding = async (
		actionId: AppHotkeyActionId,
		defaultBinding: string,
	) => {
		if (recordingActionId === actionId) {
			cancelRecording()
		}
		await saveBinding(actionId, defaultBinding)
	}

	const resetAllBindings = async () => {
		cancelRecording()
		setErrors({})
		await resetHotkeyBindings()
	}

	return (
		<div className="flex-1 overflow-y-auto p-12">
			<FieldSet>
				<div className="flex items-start justify-between gap-3">
					<div>
						<FieldLegend>Hotkeys</FieldLegend>
						<FieldDescription>
							Customize keyboard shortcuts used throughout the app
						</FieldDescription>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void resetAllBindings()}
					>
						Reset to defaults
					</Button>
				</div>

				{groupedDefinitions.map((group) => (
					<div key={group.category} className="mt-8 first:mt-0">
						<h3 className="text-sm font-medium text-muted-foreground">
							{APP_HOTKEY_CATEGORY_LABELS[group.category]}
						</h3>
						<FieldGroup className="mt-3">
							{group.definitions.map((definition) => {
								const isRecording =
									recorder.isRecording && recordingActionId === definition.id
								const binding = hotkeys[definition.id]
								const hasBinding = binding.length > 0
								const isDefaultBinding = binding === definition.defaultBinding

								return (
									<Field
										key={definition.id}
										orientation="horizontal"
										className="items-start"
									>
										<FieldContent>
											<FieldLabel>{definition.label}</FieldLabel>
											{errors[definition.id] && (
												<FieldDescription className="text-destructive">
													{errors[definition.id]}
												</FieldDescription>
											)}
										</FieldContent>
										<div className="flex flex-wrap items-center justify-end gap-2">
											{!isDefaultBinding && (
												<Button
													variant="ghost"
													size="icon"
													onClick={() =>
														void restoreDefaultBinding(
															definition.id,
															definition.defaultBinding,
														)
													}
													title="Restore default shortcut"
												>
													<IconRefresh className="size-4" />
												</Button>
											)}
											{hasBinding ? (
												<HotkeyKbd binding={binding} />
											) : (
												<span className="text-sm text-muted-foreground">
													Unassigned
												</span>
											)}
											<Button
												variant="secondary"
												size="icon"
												onClick={() => {
													if (isRecording) {
														cancelRecording()
														return
													}
													startRecording(definition.id)
												}}
												title={
													isRecording ? "Cancel recording" : "Record shortcut"
												}
											>
												{isRecording ? (
													<IconSquareFilled className="size-3 text-red-500/90" />
												) : (
													<IconCircleFilled className="size-3 text-red-500/90" />
												)}
											</Button>
										</div>
									</Field>
								)
							})}
						</FieldGroup>
					</div>
				))}
			</FieldSet>
		</div>
	)
}
