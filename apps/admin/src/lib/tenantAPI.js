import { apiClient } from './api.js'

export const tenantAPI = {
  getTenants: async ({ includeTokens = false } = {}) => {
    const params = includeTokens ? { includeTokens: true } : {}
    const { data } = await apiClient.get('/tenants', { params })
    return data
  },

  createTenant: async (payload) => {
    const { data } = await apiClient.post('/tenants', payload)
    return data
  },

  getSettings: async () => {
    const { data } = await apiClient.get('/tenant-settings')
    return data.settings
  },

  updateSettings: async (payload) => {
    const { data } = await apiClient.put('/tenant-settings', payload)
    return data.settings
  },

  acceptInvitation: async (tenantId) => {
    const { data } = await apiClient.post(`/tenants/${tenantId}/accept`)
    return data
  },

  acceptOwnershipTransfer: async (token, tenantId) => {
    const { data } = await apiClient.post(`/tenants/${tenantId}/accept-transfer`, { token })
    return data
  },

  getWebhooks: async (tenantId) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const { data } = await apiClient.get(`/admin/tenants/${tenantId}/webhooks`)
    return data
  },

  createWebhook: async (tenantId, payload) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks`, payload)
    return data
  },

  updateWebhook: async (tenantId, id, payload) => {
    if (!tenantId || !id) throw new Error('tenantId ve id gerekli')
    const { data } = await apiClient.put(`/admin/tenants/${tenantId}/webhooks/${id}`, payload)
    return data
  },

  deleteWebhook: async (tenantId, id) => {
    if (!tenantId || !id) throw new Error('tenantId ve id gerekli')
    const { data } = await apiClient.delete(`/admin/tenants/${tenantId}/webhooks/${id}`)
    return data
  },

  rotateWebhookSecret: async (tenantId, id) => {
    if (!tenantId || !id) throw new Error('tenantId ve id gerekli')
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks/${id}/rotate-secret`)
    return data
  },

  getWebhookQueue: async (tenantId, { limit } = {}) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const params = limit ? { limit } : undefined
    const { data } = await apiClient.get(`/admin/tenants/${tenantId}/webhooks/queue`, { params })
    return data
  },

  triggerTenantWebhooks: async (tenantId, payload = {}) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks/trigger`, payload)
    return data
  },

  sendTestWebhook: async (tenantId, id, payload = {}) => {
    if (!tenantId || !id) throw new Error('tenantId ve id gerekli')
    const body = payload && Object.keys(payload).length ? { payload } : {}
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks/${id}/test`, body)
    return data
  },

  getDomainEventTypes: async () => {
    const { data } = await apiClient.get('/admin/domain-event-types')
    return data.types || []
  },

  // Bulk operasyonlar
  bulkRetryAllFailed: async (tenantId) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks/queue/retry-all`)
    return data
  },

  bulkDeleteAllFailed: async (tenantId) => {
    if (!tenantId) throw new Error('tenantId gerekli')
    const { data } = await apiClient.delete(`/admin/tenants/${tenantId}/webhooks/queue/failed`)
    return data
  },

  bulkRetryByWebhook: async (tenantId, webhookId) => {
    if (!tenantId || !webhookId) throw new Error('tenantId ve webhookId gerekli')
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/webhooks/${webhookId}/queue/retry`)
    return data
  },

  bulkDeleteByWebhook: async (tenantId, webhookId) => {
    if (!tenantId || !webhookId) throw new Error('tenantId ve webhookId gerekli')
    const { data } = await apiClient.delete(`/admin/tenants/${tenantId}/webhooks/${webhookId}/queue/failed`)
    return data
  }
}