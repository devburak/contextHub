import { describe, expect, it, vi } from 'vitest'
import {
  getAdjacentDocuments,
  groupDocuments,
  loadCatalog,
  loadDocument,
  localizeDocuments,
  searchDocuments,
  validateCatalog,
} from './docsData.js'

const localizedDocuments = [
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

const documents = localizedDocuments.map((document) => ({
  slug: document.slug,
  title: { en: document.title, tr: `${document.title} TR` },
  description: { en: document.description, tr: `${document.description} TR` },
  category: { en: document.category, tr: `${document.category} TR` },
  audience: { en: ['backend'], tr: ['backend'] },
  tags: document.tags,
  locales: {
    en: { sourceUrl: `/developer-docs/en/${document.slug}.md`, searchText: document.searchText },
    tr: { sourceUrl: `/developer-docs/tr/${document.slug}.md`, searchText: `${document.searchText} tr` },
  },
}))

describe('public documentation data helpers', () => {
  it('validates and loads a versioned catalog', async () => {
    const catalog = {
      schemaVersion: 2,
      defaultSlug: 'overview',
      defaultLocale: 'en',
      locales: [{ code: 'en' }, { code: 'tr' }],
      documents,
    }
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => catalog,
    })

    await expect(loadCatalog(fetchImplementation)).resolves.toEqual(catalog)
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/developer-docs/catalog.json',
      { cache: 'no-cache' },
    )
    expect(() => validateCatalog({ schemaVersion: 2, documents: [] })).toThrow(/invalid or empty/i)
  })

  it('loads only safe document slugs', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Overview',
    })

    const checksum = 'a'.repeat(64)
    await expect(loadDocument('overview', 'en', checksum, fetchImplementation)).resolves.toBe('# Overview')
    await expect(loadDocument('../secret', 'en', checksum, fetchImplementation)).rejects.toThrow(/slug is invalid/i)
    await expect(loadDocument('overview', '../tr', checksum, fetchImplementation)).rejects.toThrow(/locale is invalid/i)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(fetchImplementation).toHaveBeenCalledWith(
      `/developer-docs/en/overview.md?v=${checksum}`,
      expect.objectContaining({ cache: 'force-cache' }),
    )
  })

  it('searches body metadata, groups navigation, and finds adjacent pages', () => {
    const englishDocuments = localizeDocuments({ locales: [{ code: 'en' }], defaultLocale: 'en', documents }, 'en')
    expect(searchDocuments(englishDocuments, 'webhook cloudflare')).toEqual([englishDocuments[1]])
    expect(searchDocuments(englishDocuments, 'missing')).toEqual([])
    expect(groupDocuments(englishDocuments)).toEqual([
      { category: 'Start here', items: [englishDocuments[0]] },
      { category: 'Reliability', items: [englishDocuments[1]] },
    ])
    expect(getAdjacentDocuments(englishDocuments, 'overview')).toEqual({
      previous: null,
      next: englishDocuments[1],
    })
    expect(localizeDocuments({ locales: [{ code: 'en' }, { code: 'tr' }], defaultLocale: 'en', documents }, 'tr')[0].title)
      .toBe('Developer overview TR')
  })
})
