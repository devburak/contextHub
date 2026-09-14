// Saving can finish after the editor has moved to another content or selection.
// Never overwrite that editor, or an unsaved draft whose validation failed.
export async function applyContentVersion({ version, save, isCurrent, apply }) {
  if (!isCurrent()) return false
  if (save) {
    const saved = await save()
    if (!isCurrent()) return false
    if (!saved) throw new Error('Current content could not be saved')
  }
  if (!isCurrent()) return false
  apply(version)
  return true
}
