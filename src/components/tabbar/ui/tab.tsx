type TabProps = {
  name: string
}

export function Tab({ name }: TabProps) {
  return (
    <div
      className="py-2 text-muted-foreground cursor-default"
      data-tauri-drag-region
    >
      {name}
    </div>
  )
}
