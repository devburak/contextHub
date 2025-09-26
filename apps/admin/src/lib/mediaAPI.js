import { apiClient } from './api.js'

export const mediaAPI = {
  list: async ({
    page = 1,
    limit = 20,
    filters = {},
    search,
    mimeType,
    tags,
    status,
  } = {}) => {
    const effectiveFilters = { ...filters }

    if (search !== undefined) effectiveFilters.search = search
    if (mimeType !== undefined) effectiveFilters.mimeType = mimeType
    if (status !== undefined) effectiveFilters.status = status
    if (tags !== undefined) effectiveFilters.tags = tags

    const params = { page, limit }
    if (effectiveFilters.search) params.search = effectiveFilters.search
    if (effectiveFilters.mimeType) params.mimeType = effectiveFilters.mimeType
    if (Array.isArray(effectiveFilters.tags) && effectiveFilters.tags.length) {
      params.tags = effectiveFilters.tags.join(',')
    }
    if (effectiveFilters.status) params.status = effectiveFilters.status

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

  createExternal: async ({
    url,
    title,
    description,
    tags,
    provider,
    providerId,
    thumbnailUrl,
    altText,
    duration,
  }) => {
    const response = await apiClient.post('/media/external', {
      url,
      title,
      description,
      tags,
      provider,
      providerId,
      thumbnailUrl,
      altText,
      duration,
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
