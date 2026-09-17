export function isCellSelectionGesture(event) {
  if (!event || event.button !== 0) return false
  return Boolean(event.metaKey || event.ctrlKey || event.altKey)
}
