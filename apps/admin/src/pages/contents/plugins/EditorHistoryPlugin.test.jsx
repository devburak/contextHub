import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { describe, expect, it, vi } from 'vitest'
import { getHistoryAction, registerHistoryShortcuts } from './editorHistoryShortcuts.js'

function createKeyboardEvent(overrides = {}) {
  return {
    key: 'z',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  }
}

describe('editor history keyboard shortcuts', () => {
  it.each([
    [{ ctrlKey: true, key: 'z' }, 'undo'],
    [{ metaKey: true, key: 'Z' }, 'undo'],
    [{ ctrlKey: true, shiftKey: true, key: 'z' }, 'redo'],
    [{ metaKey: true, shiftKey: true, key: 'z' }, 'redo'],
    [{ ctrlKey: true, key: 'y' }, 'redo'],
  ])('maps %o to %s', (event, expected) => {
    expect(getHistoryAction(createKeyboardEvent(event))).toBe(expected)
  })

  it('ignores unrelated and Alt-modified shortcuts', () => {
    expect(getHistoryAction(createKeyboardEvent({ ctrlKey: true, key: 'b' }))).toBeNull()
    expect(getHistoryAction(createKeyboardEvent({ ctrlKey: true, altKey: true }))).toBeNull()
  })

  it('dispatches one Lexical history command and consumes the native shortcut', () => {
    let keyDownHandler
    const unregister = vi.fn()
    const editor = {
      dispatchCommand: vi.fn(),
      registerCommand: vi.fn((command, handler, priority) => {
        expect(command).toBe(KEY_DOWN_COMMAND)
        expect(priority).toBe(COMMAND_PRIORITY_HIGH)
        keyDownHandler = handler
        return unregister
      }),
    }
    expect(registerHistoryShortcuts(editor)).toBe(unregister)

    const undoEvent = createKeyboardEvent({ metaKey: true })
    expect(keyDownHandler(undoEvent)).toBe(true)
    expect(editor.dispatchCommand).toHaveBeenLastCalledWith(UNDO_COMMAND, undefined)
    expect(undoEvent.preventDefault).toHaveBeenCalledOnce()
    expect(undoEvent.stopPropagation).toHaveBeenCalledOnce()

    const redoEvent = createKeyboardEvent({ ctrlKey: true, key: 'y' })
    expect(keyDownHandler(redoEvent)).toBe(true)
    expect(editor.dispatchCommand).toHaveBeenLastCalledWith(REDO_COMMAND, undefined)
    expect(editor.dispatchCommand).toHaveBeenCalledTimes(2)
  })
})
