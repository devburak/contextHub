import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import CreateTenant from './CreateTenant.jsx'

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), resetQueries: vi.fn() }),
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
    useQuery.mockReturnValue({ data: { hasFreeTenant: false, plans: [
      { slug: 'free', name: 'Free', available: true },
      { slug: 'pro', name: 'Pro', available: true },
    ] }, refetch: vi.fn() })
    mutationOptions = null
    useMutation.mockImplementation((options) => {
      mutationOptions = options
      return { mutate: vi.fn(), isLoading: false }
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
  it('disables Free when the allowance is used but allows selecting a paid plan', async () => {
    useQuery.mockReturnValue({ data: { hasFreeTenant: true, plans: [
      { slug: 'free', name: 'Free', available: false },
      { slug: 'pro', name: 'Pro', available: true },
    ] } })
    await act(async () => root.render(<MemoryRouter><CreateTenant /></MemoryRouter>))
    expect(container.querySelector('input[value="free"]').disabled).toBe(true)
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true)
    await act(async () => container.querySelector('input[value="pro"]').click())
    expect(container.querySelector('button[type="submit"]').disabled).toBe(false)
    expect(container.querySelector('button[type="submit"]').textContent).toBe('tenant.continue_payment')
  })

  it('blocks submission when the catalog cannot be loaded', async () => {
    useQuery.mockReturnValue({ isError: true, refetch: vi.fn() })
    await act(async () => root.render(<MemoryRouter><CreateTenant /></MemoryRouter>))
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true)
    expect(container.textContent).toContain('tenant.plans_error')
  })

  it('continues a pending paid tenant to billing after refreshing the session', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/varliklar/yeni']}>
      <Routes>
        <Route path="/varliklar/yeni" element={<CreateTenant />} />
        <Route path="/faturalandirma" element={<div>Payment setup</div>} />
      </Routes>
    </MemoryRouter>))
    await act(async () => mutationOptions.onSuccess({ tenant: { name: 'Acme', status: 'pending_payment' } }))
    expect(container.textContent).toBe('Payment setup')
  })

})
