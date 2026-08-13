import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Footer from './Footer.jsx'

describe('Footer', () => {
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

  it('keeps developer documentation opt-in', async () => {
    await act(async () => {
      root.render(<Footer />)
    })

    expect(container.querySelector('a[href="/docs/overview"]')).toBeNull()
  })

  it('links login users to the documentation overview', async () => {
    await act(async () => {
      root.render(<Footer showDeveloperDocs />)
    })

    const link = container.querySelector('a[href="/docs/overview"]')
    expect(link?.textContent).toContain('Geliştirici dokümantasyonu')
    expect(link?.querySelector('svg')).not.toBeNull()
  })
})
