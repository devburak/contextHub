import { describe, expect, it } from 'vitest'
import { isCellSelectionGesture } from './tableSelectionGesture.js'

describe('isCellSelectionGesture', () => {
  it('keeps a regular primary click available for caret placement', () => {
    expect(isCellSelectionGesture({ button: 0 })).toBe(false)
    expect(isCellSelectionGesture({ button: 0, shiftKey: true })).toBe(false)
  })

  it.each(['metaKey', 'ctrlKey', 'altKey'])('starts cell selection with %s', (modifier) => {
    expect(isCellSelectionGesture({ button: 0, [modifier]: true })).toBe(true)
  })

  it('does not intercept secondary clicks', () => {
    expect(isCellSelectionGesture({ button: 2, ctrlKey: true })).toBe(false)
  })
})
