import { Kbd, KbdGroup } from "@mdit/ui/components/kbd"
import { hotkeyToDisplayTokens } from "@/lib/hotkeys"

type HotkeyKbdProps = {
	binding: string
	className?: string
	kbdClassName?: string
}

export function HotkeyKbd({
	binding,
	className,
	kbdClassName,
}: HotkeyKbdProps) {
	const tokens = hotkeyToDisplayTokens(binding)
	if (tokens.length === 0) {
		return null
	}

	return (
		<KbdGroup className={className}>
			{tokens.map((token) => (
				<Kbd key={`${binding}-${token}`} className={kbdClassName}>
					{token}
				</Kbd>
			))}
		</KbdGroup>
	)
}
