import { apiClient } from './api.js'

export const mediaAPI = {
  list: async ({ page = 1, limit = 20, filters = {} } = {}) => {
    const params = { page, limit }
    if (filters.search) params.search = filters.search
    if (filters.mimeType) params.mimeType = filters.mimeType
    if (Array.isArray(filters.tags) && filters.tags.length) {
      params.tags = filters.tags.join(',')
    }
    if (filters.status) params.status = filters.status

    const response = await apiClient.get('/media', { params })
    return response.data
  },

  createPresignedUpload: async ({ fileName, contentType, size }) => {
    const response = await apiClient.post('/media/presign', {
      fileName,
      contentType,
      size,
    })
    return response.data
  },

  completeUpload: async ({ key, originalName, mimeType, size }) => {
    const response = await apiClient.post('/media', {
      key,
      originalName,
      mimeType,
      size,
    })
    return response.data.media
  },

  update: async (id, payload) => {
    const response = await apiClient.patch(`/media/${id}`, payload)
    return response.data.media
  },

  remove: async (id) => {
    await apiClient.delete(`/media/${id}`)
    return true
  },

  bulkDelete: async (ids) => {
    const response = await apiClient.post('/media/bulk/delete', { ids })
    return response.data
  },

  bulkTag: async ({ ids, tags, mode = 'add' }) => {
    const response = await apiClient.post('/media/bulk/tags', { ids, tags, mode })
    return response.data
  },
}
