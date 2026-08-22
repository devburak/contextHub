import { apiClient } from '../api.js'

export async function fetchBillingOverview() {
  const response = await apiClient.get('/billing/overview')
  return response.data
}

export async function createBillingCheckout(priceKey) {
  const response = await apiClient.post('/billing/checkout', { priceKey })
  return response.data
}

export async function createBillingPortal() {
  const response = await apiClient.post('/billing/portal', {})
  return response.data
}
