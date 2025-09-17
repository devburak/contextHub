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
  }
}
