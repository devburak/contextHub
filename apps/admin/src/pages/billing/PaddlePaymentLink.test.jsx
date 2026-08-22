import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '../../i18n.js'
import PaddlePaymentLink from './PaddlePaymentLink.jsx'

describe('PaddlePaymentLink', () => {
  let container
  let root

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await i18n.changeLanguage('en')
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('fails closed while keeping pricing and policies reachable', async () => {
    const loader = vi.fn().mockResolvedValue({})
    await act(async () => {
      root.render(<PaddlePaymentLink clientToken="" paddleLoader={loader} />)
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Payment collection is not active yet')
    expect(container.querySelector('a[href="/docs/pricing-and-plans"]')).not.toBeNull()
    expect(container.querySelector('a[href="/docs/terms-of-service"]')).not.toBeNull()
    expect(container.querySelector('a[href="/docs/privacy-notice"]')).not.toBeNull()
    expect(container.querySelector('a[href="/docs/cancellation-and-refunds"]')).not.toBeNull()
    expect(Array.from(container.querySelectorAll('button')).map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['TR', 'EN']),
    )
  })

  it('initializes Paddle.js in sandbox and becomes ready', async () => {
    const paddle = {
      Environment: { set: vi.fn() },
      Initialize: vi.fn(),
    }
    await act(async () => {
      root.render(
        <PaddlePaymentLink
          clientToken="test_client_token"
          environment="sandbox"
          paddleLoader={() => Promise.resolve(paddle)}
        />,
      )
    })

    expect(paddle.Environment.set).toHaveBeenCalledWith('sandbox')
    expect(paddle.Initialize).toHaveBeenCalledWith(expect.objectContaining({ token: 'test_client_token' }))
    expect(container.textContent).toContain('Secure checkout is ready')
  })
})
