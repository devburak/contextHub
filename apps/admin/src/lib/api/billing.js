import { apiClient } from '../api.js'

export async function fetchBillingOverview({ previewCountry = '', previewPlanSlug = '', previewInterval = 'month' } = {}) {
  const response = await apiClient.get('/billing/overview', {
    params: { previewCountry, previewPlanSlug, previewInterval },
  })
  return response.data
}

export async function createBillingCheckout(priceId) {
  const response = await apiClient.post('/billing/checkout', { priceId })
  return response.data
}

export async function createBillingPortal() {
  const response = await apiClient.post('/billing/portal', {})
  return response.data
}

export async function updateBillingProfile(profile) {
  const response = await apiClient.put('/billing/profile', profile)
  return response.data
}

export function billingInvoiceDocumentUrl(invoiceId) {
  const baseUrl = String(apiClient.defaults.baseURL || window.location.origin).replace(/\/$/, '')
  return `${baseUrl}/billing/invoices/${encodeURIComponent(invoiceId)}/document`
}
