import { describe, expect, it, vi } from 'vitest'
import {
  getAdjacentDocuments,
  groupDocuments,
  loadCatalog,
  loadDocument,
  searchDocuments,
  validateCatalog,
} from './docsData.js'

const documents = [
  {
    slug: 'overview',
    title: 'Developer overview',
    description: 'Platform model',
    category: 'Start here',
    tags: ['architecture'],
    searchText: 'tenant boundaries',
  },
  {
    slug: 'caching',
    title: 'Caching and freshness',
    description: 'Edge caching',
    category: 'Reliability',
    tags: ['cloudflare'],
    searchText: 'webhook invalidation',
  },
]

describe('public documentation data helpers', () => {
  it('validates and loads a versioned catalog', async () => {
    const catalog = { schemaVersion: 1, defaultSlug: 'overview', documents }
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => catalog,
    })

    await expect(loadCatalog(fetchImplementation)).resolves.toEqual(catalog)
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/developer-docs/catalog.json',
      { cache: 'force-cache' },
    )
    expect(() => validateCatalog({ schemaVersion: 1, documents: [] })).toThrow(/invalid or empty/i)
  })

  it('loads only safe document slugs', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Overview',
    })

    await expect(loadDocument('overview', fetchImplementation)).resolves.toBe('# Overview')
    await expect(loadDocument('../secret', fetchImplementation)).rejects.toThrow(/slug is invalid/i)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it('searches body metadata, groups navigation, and finds adjacent pages', () => {
    expect(searchDocuments(documents, 'webhook cloudflare')).toEqual([documents[1]])
    expect(searchDocuments(documents, 'missing')).toEqual([])
    expect(groupDocuments(documents)).toEqual([
      { category: 'Start here', items: [documents[0]] },
      { category: 'Reliability', items: [documents[1]] },
    ])
    expect(getAdjacentDocuments(documents, 'overview')).toEqual({
      previous: null,
      next: documents[1],
    })
  })
})
