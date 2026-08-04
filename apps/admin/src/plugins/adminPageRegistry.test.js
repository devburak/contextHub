import { describe, expect, it } from 'vitest'
import { createElement } from 'react'

import {
  navigationFromAdminPages,
  validateAdminPluginPages
} from './adminPageRegistry.js'

describe('admin plugin page registry', () => {
  it('validates pages and produces ordered navigation', () => {
    const pages = validateAdminPluginPages([
      {
        id: 'semantic-search.main',
        path: '/semantic-search',
        element: createElement('div'),
        permission: 'semanticSearch.configure',
        menu: { id: 'semantic-search', name: 'Semantik Arama', order: 55 }
      }
    ])

    expect(navigationFromAdminPages(pages)).toEqual([
      expect.objectContaining({
        id: 'semantic-search',
        href: '/semantic-search',
        permission: 'semanticSearch.configure'
      })
    ])
  })

  it('fails fast on core and plugin collisions', () => {
    expect(() => validateAdminPluginPages([{
      id: 'contents',
      path: '/private-content',
      element: createElement('div')
    }])).toThrow('admin page id collision')

    expect(() => validateAdminPluginPages([{
      id: 'semantic-search.main',
      path: '/contents',
      element: createElement('div')
    }])).toThrow('admin page path collision')
  })
})
