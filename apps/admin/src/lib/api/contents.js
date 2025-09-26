import { apiClient } from '../api.js'

const BASE = '/contents'

export async function listContents({ page = 1, limit = 20, filters = {} } = {}) {
  const params = { page, limit }
  if (filters.status) params.status = filters.status
  if (filters.search) params.search = filters.search
  if (filters.category) params.category = filters.category
  if (filters.tag) params.tag = filters.tag

  const response = await apiClient.get(BASE, { params })
  return response.data
}

export async function getContent({ id }) {
  const response = await apiClient.get(`${BASE}/${id}`)
  return response.data.content
}

export async function createContent({ payload }) {
  const response = await apiClient.post(BASE, payload)
  return response.data.content
}

export async function updateContent({ id, payload }) {
  const response = await apiClient.put(`${BASE}/${id}`, payload)
  return response.data.content
}

export async function listVersions({ id }) {
  const response = await apiClient.get(`${BASE}/${id}/versions`)
  const { versions = [], deletedVersions = [], deletionLog = [] } = response.data || {}
  return { versions, deletedVersions, deletionLog }
}

export async function deleteContentVersions({ id, versionIds }) {
  const response = await apiClient.post(`${BASE}/${id}/versions/delete`, {
    versionIds,
  })
  return response.data
}

export async function checkSlugAvailability({ slug, id }) {
  const response = await apiClient.get(`${BASE}/check-slug`, {
    params: {
      slug,
      contentId: id,
    },
  })
  return response.data
}
