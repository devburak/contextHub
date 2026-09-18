import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'

export function getHistoryAction(event) {
  if (!event || event.altKey || (!event.metaKey && !event.ctrlKey)) {
    return null
  }

  const key = String(event.key || '').toLowerCase()
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo'
  }
  if (key === 'y' && !event.shiftKey) {
    return 'redo'
  }
  return null
}

export function registerHistoryShortcuts(editor) {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      const action = getHistoryAction(event)
      if (!action) return false

      event.preventDefault()
      event.stopPropagation()
      editor.dispatchCommand(action === 'undo' ? UNDO_COMMAND : REDO_COMMAND, undefined)
      return true
    },
    COMMAND_PRIORITY_HIGH
  )
}
