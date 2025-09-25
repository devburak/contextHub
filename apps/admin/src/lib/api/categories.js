import { apiClient } from '../api.js'

export async function listCategories(params = {}) {
  const queryParams = { flat: true, ...params }
  if (queryParams.ids && !queryParams.ids.length) {
    delete queryParams.ids
  }
  if (!('limit' in queryParams) && !queryParams.ids) {
    queryParams.limit = 20
  }

  const response = await apiClient.get('/categories', {
    params: queryParams,
  })
  return {
    categories: response.data.categories ?? [],
    pagination: response.data.pagination ?? null,
  }
}
