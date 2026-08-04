import { describe, expect, it } from 'vitest'

import roleServiceModule from './roleService'

const { RoleService } = roleServiceModule

describe('extension permission registry', () => {
  it('registers idempotently and accepts the permissions in role validation', () => {
    const service = new RoleService()
    const first = service.registerExtensionPermissions('search', ['semantic.query'])
    const second = service.registerExtensionPermissions('search', ['semantic.query'])
    expect(second).toBe(first)
    expect(service.validatePermissions(['semantic.query', 'unknown'])).toEqual(['semantic.query'])
  })

  it('rejects core and cross-plugin collisions without partially registering', () => {
    const service = new RoleService()
    const corePermission = [...service.validPermissions][0]
    expect(() => service.registerExtensionPermissions('bad', ['partial.permission', corePermission]))
      .toThrow(/collision with core/)
    expect(service.validPermissions.has('partial.permission')).toBe(false)

    service.registerExtensionPermissions('first', ['shared.permission'])
    expect(() => service.registerExtensionPermissions('second', ['shared.permission']))
      .toThrow(/collision/)
  })
})
