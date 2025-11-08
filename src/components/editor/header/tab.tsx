import { useTabStore } from '@/store/tab-store'

export function Tab() {
  const tab = useTabStore((s) => s.tab)

  if (!tab) return null

  return (
    <div className="text-sm py-2 text-muted-foreground cursor-default">
      {tab.name}
    </div>
  )
}
