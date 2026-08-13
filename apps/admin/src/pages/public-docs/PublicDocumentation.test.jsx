import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicDocumentation from './PublicDocumentation.jsx'

const catalog = {
  schemaVersion: 2,
  title: { en: 'ContextHub Cloud Developer Docs', tr: 'ContextHub Cloud Geliştirici Dokümanları' },
  description: { en: 'Developer documentation', tr: 'Geliştirici dokümanları' },
  version: 'test',
  defaultSlug: 'overview',
  defaultLocale: 'en',
  aiLocale: 'en',
  locales: [
    { code: 'en', label: 'English', shortLabel: 'EN' },
    { code: 'tr', label: 'Türkçe', shortLabel: 'TR' },
  ],
  documents: [
    {
      slug: 'overview',
      title: { en: 'Cloud overview', tr: 'Cloud genel bakış' },
      description: { en: 'Platform model', tr: 'Platform modeli' },
      category: { en: 'Start here', tr: 'Başlangıç' },
      order: 10,
      audience: { en: ['frontend'], tr: ['frontend'] },
      tags: ['overview'],
      locales: {
        en: {
          searchText: 'platform tenant model',
          sourceUrl: '/developer-docs/en/overview.md',
          checksum: 'a'.repeat(64),
        },
        tr: {
          searchText: 'platform tenant modeli',
          sourceUrl: '/developer-docs/tr/overview.md',
          checksum: 'b'.repeat(64),
        },
      },
    },
  ],
}

describe('PublicDocumentation', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.setItem('docs.locale', 'en')
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('catalog.json')) {
        return { ok: true, json: async () => catalog }
      }
      return {
        ok: true,
        text: async () => url.includes('/tr/')
          ? '# Cloud genel bakış\n\nMüşteriler için SaaS dokümanı.\n\n## Entegrasyon modeli\n\nTenant sınırlarını kullanın.'
          : '# Cloud overview\n\nSaaS documentation for customers.\n\n## Integration model\n\nUse tenant boundaries.',
      }
    }))
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    localStorage.removeItem('docs.locale')
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('renders a public Markdown document and its table of contents', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/docs/overview']}>
          <Routes>
            <Route path="/docs/:slug" element={<PublicDocumentation />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('.docs-article h1')?.textContent).toBe('Cloud overview')
    expect(container.querySelector('.docs-toc a')?.textContent).toBe('Integration model')
    expect(container.textContent).toContain('SaaS documentation for customers.')
    const communityLink = container.querySelector('.docs-github-link')
    expect(communityLink?.getAttribute('href'))
      .toBe('https://github.com/devburak/contextHub')
    expect(communityLink?.getAttribute('aria-label')).toBe('Community repository')
    expect(communityLink?.textContent).toBe('')
    expect(container.querySelector('a[href="https://api.ctxhub.net/api/docs"]')).not.toBeNull()
    expect(fetch).toHaveBeenCalledWith('/developer-docs/catalog.json', { cache: 'no-cache' })
    expect(fetch).toHaveBeenCalledWith(
      `/developer-docs/en/overview.md?v=${'a'.repeat(64)}`,
      expect.objectContaining({ cache: 'force-cache' }),
    )
  })

  it('switches the human documentation to Turkish while the AI index remains English', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/docs/overview']}>
          <Routes>
            <Route path="/docs/:slug" element={<PublicDocumentation />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const turkishButton = Array.from(container.querySelectorAll('.docs-language-switcher button'))
      .find((button) => button.textContent === 'TR')
    await act(async () => turkishButton.click())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('.docs-article h1')?.textContent).toBe('Cloud genel bakış')
    expect(container.textContent).toContain('Müşteriler için SaaS dokümanı.')
    expect(container.querySelector('a[href="/developer-docs/llms.txt"]')).not.toBeNull()
    expect(localStorage.getItem('docs.locale')).toBe('tr')
  })
})
