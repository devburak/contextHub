import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import CreateTenant from './CreateTenant.jsx'

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ refreshSession: vi.fn() }),
}))
vi.mock('../../lib/useApiError.js', () => ({
  useApiError: () => () => 'tenant slug conflict',
}))
vi.mock('../../lib/tenantAPI.js', () => ({
  tenantAPI: { createTenant: vi.fn() },
}))

describe('CreateTenant', () => {
  let container
  let root
  let mutationOptions

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mutationOptions = null
    useMutation.mockImplementation((options) => {
      mutationOptions = options
      return { mutate: vi.fn(), isPending: false }
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
  })

  it('centers the form container independently of the sidebar', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CreateTenant />
        </MemoryRouter>
      )
    })

    expect(container.firstElementChild?.className).toContain('mx-auto')
    expect(container.firstElementChild?.className).toContain('w-full')
  })

  it('shows available slug suggestions and applies the selected one', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CreateTenant />
        </MemoryRouter>
      )
    })

    await act(async () => {
      mutationOptions.onError({
        response: {
          data: {
            error: 'SlugConflict',
            suggestions: ['acme-2', 'acme-4', 'acme-5'],
          },
        },
      })
    })

    const suggestion = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'acme-2')
    expect(suggestion).toBeTruthy()

    await act(async () => {
      suggestion.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('#slug')?.value).toBe('acme-2')
    expect(container.textContent).not.toContain('tenant slug conflict')
  })
})
