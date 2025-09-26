import { apiClient } from './api.js'

export const featureFlagsAPI = {
  list: async () => {
    const { data } = await apiClient.get('/feature-flags')
    return data.flags
  },

  create: async (payload) => {
    const { data } = await apiClient.post('/feature-flags', payload)
    return data.flag
  }
}
