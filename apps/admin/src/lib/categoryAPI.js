import { apiClient } from './api.js'

export const categoryAPI = {
  listTree: async () => {
    const response = await apiClient.get('/categories')
    return response.data.categories
  },

  listFlat: async () => {
    const response = await apiClient.get('/categories', { params: { flat: true } })
    return response.data.categories
  },

  get: async (id) => {
    const response = await apiClient.get(`/categories/${id}`)
    return response.data.category
  },

  create: async (payload) => {
    const response = await apiClient.post('/categories', payload)
    return response.data.category
  },

  update: async (id, payload) => {
    const response = await apiClient.put(`/categories/${id}`, payload)
    return response.data.category
  },

  remove: async (id, options = {}) => {
    const response = await apiClient.delete(`/categories/${id}`, {
      params: { cascade: options.cascade ?? true },
    })
    return response.data
  },
}
