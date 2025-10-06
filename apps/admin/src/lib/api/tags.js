import { apiClient } from '../api.js'

export async function searchTags({ search, limit, page, ids } = {}) {
  const params = {}
  if (search) params.search = search
  if (typeof limit === 'number') params.limit = limit
  if (typeof page === 'number') params.page = page
  if (Array.isArray(ids) && ids.length) {
    params.ids = ids.join(',')
  }

  const response = await apiClient.get('/tags', { params })
  return {
    tags: response.data.tags ?? [],
    pagination: response.data.pagination ?? null,
  }
}

export async function createTag({ title }) {
  const response = await apiClient.post('/tags', { title })
  return response.data.tag
}
