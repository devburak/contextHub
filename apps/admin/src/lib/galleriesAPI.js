import { apiClient } from './api.js'

export const galleriesAPI = {
  list: async ({ search, contentId, page = 1, limit = 20 } = {}) => {
    const params = {}
    if (search) params.search = search
    if (contentId) params.contentId = contentId
    if (page) params.page = page
    if (limit) params.limit = limit
    const { data } = await apiClient.get('/galleries', { params })
    return data
  },

  get: async (id) => {
    const { data } = await apiClient.get(`/galleries/${id}`)
    return data.gallery
  },

  create: async (payload) => {
    const { data } = await apiClient.post('/galleries', payload)
    return data.gallery
  },

  update: async (id, payload) => {
    const { data } = await apiClient.put(`/galleries/${id}` , payload)
    return data.gallery
  },

  remove: async (id) => {
    await apiClient.delete(`/galleries/${id}`)
    return true
  }
}
