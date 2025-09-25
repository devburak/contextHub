import { apiClient } from '../api.js'

export async function listCategories({ flat = true } = {}) {
  const response = await apiClient.get('/categories', {
    params: { flat }
  })
  return response.data.categories ?? []
}
