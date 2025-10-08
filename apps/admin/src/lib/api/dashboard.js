import { apiClient } from '../api.js'

export async function fetchDashboardSummary() {
  const response = await apiClient.get('/dashboard/summary')
  return response.data
}

export async function fetchDashboardActivities({ type, scope, limit, offset } = {}) {
  const params = {}

  if (type) {
    params.type = type
  }

  if (scope) {
    params.scope = scope
  }

  if (typeof limit === 'number') {
    params.limit = limit
  }

  if (typeof offset === 'number') {
    params.offset = offset
  }

  const response = await apiClient.get('/dashboard/activities', { params })
  return response.data
}

export async function fetchApiStats() {
  const response = await apiClient.get('/dashboard/api-stats')
  return response.data
}

