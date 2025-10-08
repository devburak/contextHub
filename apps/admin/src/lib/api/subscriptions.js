import { apiClient } from '../api.js'

/**
 * Fetch tenant limits and usage
 * @returns {Promise<Object>} Tenant limits and current usage
 */
export async function fetchTenantLimits() {
  const response = await apiClient.get('/tenants/current/limits')
  return response.data
}

/**
 * Fetch all subscription plans
 * @returns {Promise<Array>} List of subscription plans
 */
export async function fetchSubscriptionPlans() {
  const response = await apiClient.get('/subscription-plans')
  return response.data.plans
}

/**
 * Update tenant subscription plan
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Update data { planSlug, customLimits }
 * @returns {Promise<Object>} Updated tenant
 */
export async function updateTenantSubscription(tenantId, data) {
  const response = await apiClient.put(`/tenants/${tenantId}/subscription`, data)
  return response.data
}
