export function removePathFromHistory(
  history: string[],
  historyIndex: number,
  pathToRemove: string
): { history: string[]; historyIndex: number } {
  const filteredHistory = history.filter((path) => path !== pathToRemove)

  const removedBeforeIndex = history
    .slice(0, historyIndex + 1)
    .filter((path) => path === pathToRemove).length

  let nextIndex = historyIndex - removedBeforeIndex

  if (filteredHistory.length === 0) {
    nextIndex = -1
  } else if (nextIndex < 0) {
    nextIndex = 0
  }

  return {
    history: filteredHistory,
    historyIndex: nextIndex,
  }
}
