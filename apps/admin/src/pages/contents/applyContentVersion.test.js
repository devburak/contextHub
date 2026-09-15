import { describe, expect, it, vi } from 'vitest'
import { applyContentVersion } from './applyContentVersion'

describe('applying a historical snapshot', () => {
  const version = { _id: 'version-a', html: '<p>Historical body</p>' }

  it('preserves the current draft when saving returns a validation failure', async () => {
    const apply = vi.fn()
    await expect(applyContentVersion({ version, save: async () => null, isCurrent: () => true, apply }))
      .rejects.toThrow('could not be saved')
    expect(apply).not.toHaveBeenCalled()
  })

  it('does not apply an old selection after the save finishes in another context', async () => {
    let finishSave
    let current = true
    const apply = vi.fn()
    const pending = applyContentVersion({
      version,
      save: () => new Promise((resolve) => { finishSave = resolve }),
      isCurrent: () => current,
      apply,
    })
    current = false
    finishSave({ _id: 'saved-content' })
    expect(await pending).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it('applies the complete selected snapshot only after a successful save', async () => {
    const apply = vi.fn()
    expect(await applyContentVersion({ version, save: async () => ({ _id: 'saved' }), isCurrent: () => true, apply }))
      .toBe(true)
    expect(apply).toHaveBeenCalledWith(version)
  })
})
