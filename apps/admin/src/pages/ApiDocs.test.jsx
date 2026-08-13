import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ApiDocs from './ApiDocs.jsx'

describe('ApiDocs', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('links to the public developer documentation', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ApiDocs />
        </MemoryRouter>,
      )
    })

    const docsLink = container.querySelector('a[href="/docs"]')
    expect(docsLink?.textContent).toContain('Developer Docs')
    expect(docsLink?.querySelector('svg')).not.toBeNull()
  })

  it('resolves Swagger under the Edge Gateway bypass path', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ApiDocs />
        </MemoryRouter>,
      )
    })

    expect(container.querySelector('iframe')?.getAttribute('src'))
      .toBe('https://api.ctxhub.net/api/docs')
    expect(container.querySelector('a[href="https://api.ctxhub.net/api/docs/json"]')).not.toBeNull()
    expect(container.querySelector('a[href="https://api.ctxhub.net/api/docs/yaml"]')).not.toBeNull()
  })
})
