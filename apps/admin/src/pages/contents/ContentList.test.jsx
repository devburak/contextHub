import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ContentList from './ContentList.jsx'

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => ({
      'common.edit': 'Edit',
      'common.title': 'Title',
      'common.status': 'Status',
      'common.updated': 'Updated',
    }[key] || key),
  }),
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    activeTenantId: 'tenant-1',
    hasPermission: () => true,
    hasFeature: () => true,
  }),
}))
vi.mock('../../plugins/registry.jsx', () => ({ adminPluginContentSearch: [] }))

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

describe('ContentList mobile actions', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useQuery.mockImplementation((options) => {
      const queryKey = Array.isArray(options) ? options[0] : options.queryKey?.[0]
      if (queryKey === 'contents') {
        return {
          data: {
            items: [{ _id: 'content-1', title: 'Sample Content', slug: 'sample-content', status: 'draft' }],
            pagination: { page: 1, pages: 1 },
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }
      }
      if (queryKey === 'categories') return { data: [], isLoading: false }
      return { data: { tags: [] }, isLoading: false, isFetching: false }
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('shows a mobile edit affordance and opens the editor when the row is clicked', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/contents']}>
          <Routes>
            <Route path="/contents" element={<ContentList />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      )
    })

    const mobileEditAffordance = [...container.querySelectorAll('span')]
      .find((element) => element.textContent.includes('Edit'))
    expect(mobileEditAffordance?.className).toContain('sm:hidden')

    const row = container.querySelector('tr[role="link"]')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="location"]')?.textContent)
      .toBe('/contents/content-1')
  })
})
