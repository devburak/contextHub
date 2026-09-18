import { describe, expect, it, vi } from 'vitest'
import { createBeforeUnloadHandler } from './unsavedChangesGuard.js'

describe('createBeforeUnloadHandler', () => {
  it('requests native confirmation while changes are unsaved', () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    const result = createBeforeUnloadHandler(() => true)(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe('')
    expect(result).toBe('')
  })

  it('allows closing after changes are saved', () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    const result = createBeforeUnloadHandler(() => false)(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.returnValue).toBeUndefined()
    expect(result).toBeUndefined()
  })
})
