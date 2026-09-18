import { useEffect, useRef } from 'react'
import { fetchBillingCheckoutStatus } from '../../lib/api/billing.js'

// The sandboxed payment frame cannot access the admin session. Read the
// tenant-scoped server result instead of trusting frame messages or navigation.
export function useHostedCheckoutStatus(session, activeTenantId, onResult) {
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    if (!session) return undefined
    if (session.tenantId !== activeTenantId) {
      onResultRef.current({ status: 'tenant_changed' })
      return undefined
    }
    let stopped = false
    let timer
    const check = async () => {
      let result
      try {
        result = await fetchBillingCheckoutStatus(session.id)
      } catch (error) {
        if (error.response?.status === 404) result = { status: 'expired' }
      }
      if (stopped) return
      if (['completed', 'failed', 'expired'].includes(result?.status)) {
        onResultRef.current(result)
        return
      }
      if (Date.now() >= session.expiresAt) {
        onResultRef.current({ status: 'expired' })
        return
      }
      timer = window.setTimeout(check, 2000)
    }
    timer = window.setTimeout(check, 1500)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [session, activeTenantId])
}
