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
  }
}
