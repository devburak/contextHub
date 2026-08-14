import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Footer from './Footer.jsx'
import i18n from '../i18n.js'

describe('Footer', () => {
  let container
  let root

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await i18n.changeLanguage('tr')
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    await i18n.changeLanguage('tr')
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

  it('translates the documentation link when the language changes', async () => {
    await act(async () => {
      root.render(<Footer showDeveloperDocs />)
    })
    await act(async () => {
      await i18n.changeLanguage('en')
    })

    const link = container.querySelector('a[href="/docs/overview"]')
    expect(link?.textContent).toContain('Developer documentation')
  })

  it('renders a language switcher offering both locales', async () => {
    await act(async () => {
      root.render(<Footer />)
    })

    const labels = Array.from(container.querySelectorAll('button')).map((button) => button.textContent)
    expect(labels).toContain('TR')
    expect(labels).toContain('EN')
  })
})
