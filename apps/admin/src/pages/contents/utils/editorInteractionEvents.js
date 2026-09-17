export const EDITOR_INTERACTION_CHANGE_EVENT = 'content-editor-interaction-change'
export const TABLE_SELECTION_CLEAR_EVENT = 'content-editor-table-selection-clear'

export function dispatchEditorInteractionChange(mode, active) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(EDITOR_INTERACTION_CHANGE_EVENT, {
    detail: { mode, active },
  }))
}

export function requestTableSelectionClear() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TABLE_SELECTION_CLEAR_EVENT))
}
