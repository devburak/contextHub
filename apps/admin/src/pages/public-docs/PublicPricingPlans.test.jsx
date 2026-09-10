import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import PublicPricingPlans from './PublicPricingPlans.jsx'

describe('PublicPricingPlans', () => {
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

  it('shows VAT-inclusive TRY prices and carries the selected plan through login', async () => {
    await act(async () => root.render(<PublicPricingPlans locale="tr" />))

    expect(container.textContent).toContain('₺499')
    expect(container.textContent).toContain('₺1.499')
    expect(container.textContent).toContain('KDV dahildir')
    expect(container.querySelector('a[href*="%2Ffaturalandirma%3Fplan%3Dpro%26interval%3Dmonth"]'))
      .not.toBeNull()

    const annual = Array.from(container.querySelectorAll('.docs-pricing-interval button'))
      .find((button) => button.textContent === 'Yıllık')
    await act(async () => annual.click())

    expect(container.textContent).toContain('₺4.990')
    expect(container.textContent).toContain('₺14.990')
    expect(container.querySelector('a[href*="%2Ffaturalandirma%3Fplan%3Dpromax%26interval%3Dyear"]'))
      .not.toBeNull()
  })

  it('keeps the USD catalog for English and sends signed-in owners to billing', async () => {
    await act(async () => root.render(
      <PublicPricingPlans locale="en" isAuthenticated activeTenantId="tenant-1" />,
    ))

    expect(container.textContent).toContain('$12')
    expect(container.textContent).toContain('$45')
    const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'))
    expect(hrefs).toContain('/faturalandirma?plan=pro&interval=month')
  })
})
