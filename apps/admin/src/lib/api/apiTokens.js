import { apiClient } from '../api.js'

/**
 * Fetch all API tokens for the current tenant
 * @returns {Promise<Object>} List of API tokens
 */
export async function fetchApiTokens() {
  const response = await apiClient.get('/api-tokens')
  return response.data
}

/**
 * Create a new API token
 * @param {Object} data - Token data { name, scopes, expiresInDays }
 * @returns {Promise<Object>} Created token with the actual token value
 */
export async function createApiToken(data) {
  const response = await apiClient.post('/api-tokens', data)
  return response.data
}

/**
 * Update an API token
 * @param {string} tokenId - Token ID
 * @param {Object} data - Update data { name, scopes }
 * @returns {Promise<Object>} Updated token
 */
export async function updateApiToken(tokenId, data) {
  const response = await apiClient.put(`/api-tokens/${tokenId}`, data)
  return response.data
}

/**
 * Delete an API token
 * @param {string} tokenId - Token ID
 * @returns {Promise<Object>} Deletion confirmation
 */
export async function deleteApiToken(tokenId) {
  const response = await apiClient.delete(`/api-tokens/${tokenId}`)
  return response.data
}
