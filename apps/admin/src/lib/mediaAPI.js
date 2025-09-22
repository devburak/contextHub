import { apiClient } from './api.js'

export const mediaAPI = {
  list: async (params = {}) => {
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
}
