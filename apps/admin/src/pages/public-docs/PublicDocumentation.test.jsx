import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicDocumentation from './PublicDocumentation.jsx'

const catalog = {
  schemaVersion: 1,
  title: 'ContextHub Developer Docs',
  description: 'Developer documentation',
  version: 'test',
  defaultSlug: 'overview',
  documents: [
    {
      slug: 'overview',
      title: 'Developer overview',
      description: 'Platform model',
      category: 'Start here',
      order: 10,
      audience: ['frontend'],
      tags: ['overview'],
      searchText: 'platform tenant model',
      sourceUrl: '/developer-docs/overview.md',
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
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('catalog.json')) {
        return { ok: true, json: async () => catalog }
      }
      return {
        ok: true,
        text: async () => '# Developer overview\n\nPublic content for developers.\n\n## Integration model\n\nUse tenant boundaries.',
      }
    }))
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
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

    expect(container.querySelector('.docs-article h1')?.textContent).toBe('Developer overview')
    expect(container.querySelector('.docs-toc a')?.textContent).toBe('Integration model')
    expect(container.textContent).toContain('Public content for developers.')
    expect(fetch).toHaveBeenCalledWith('/developer-docs/catalog.json', { cache: 'force-cache' })
    expect(fetch).toHaveBeenCalledWith(
      '/developer-docs/overview.md',
      expect.objectContaining({ cache: 'force-cache' }),
    )
  })
})
