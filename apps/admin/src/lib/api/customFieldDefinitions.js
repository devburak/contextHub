import { apiClient } from '../api.js'

const BASE = '/custom-field-definitions'

export async function listCustomFieldDefinitions() {
  const response = await apiClient.get(BASE)
  return response.data.definitions || []
}

export async function createCustomFieldDefinition(payload) {
  const response = await apiClient.post(BASE, payload)
  return response.data.definition
}

export async function updateCustomFieldDefinition({ id, payload }) {
  const response = await apiClient.put(`${BASE}/${id}`, payload)
  return response.data.definition
}

export async function deleteCustomFieldDefinition(id) {
  const response = await apiClient.delete(`${BASE}/${id}`)
  return response.data
}
