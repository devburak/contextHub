import axios from 'axios'
import { shouldInvalidateSession } from './sessionInvalidationPolicy.js'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
let csrfToken = null
let activeTenantId = null
let sessionRevision = 0
let sessionTransitionDepth = 0

export const setCsrfToken = (value) => {
  const nextToken = value || null
  if (nextToken !== csrfToken) {
    sessionRevision += 1
  }
  csrfToken = nextToken
}

export const setActiveTenantId = (value) => {
  activeTenantId = value || null
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Authentication is carried only by the HttpOnly session cookie. JavaScript can
// neither read nor persist it.
apiClient.interceptors.request.use((config) => {
  config.__sessionRevision = sessionRevision
  const method = String(config.method || 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method) && csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }

  // Skip tenant ID for auth, subscription-plans, and tenant creation endpoints
  const isAuthRequest = config.url?.startsWith('/auth')
  const isSubscriptionPlansRequest = config.url?.startsWith('/subscription-plans')
  const isTenantCreationRequest = config.url === '/tenants' && config.method?.toLowerCase() === 'post'

  if (activeTenantId && !isAuthRequest && !isSubscriptionPlansRequest && !isTenantCreationRequest) {
    config.headers['X-Tenant-ID'] = activeTenantId
    if (!config.params || typeof config.params !== 'object') {
      config.params = {}
    }
    if (!('tenantId' in config.params)) {
      config.params.tenantId = activeTenantId
    }
  }
  return config
})

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => {
    if (response.data?.csrfToken) {
      setCsrfToken(response.data.csrfToken)
    }
    return response
  },
  (error) => {
    const requestUrl = String(error.config?.url || '')
    const isSessionTransitionRequest = requestUrl.startsWith('/auth/switch-tenant')
    const requestRevision = Number(error.config?.__sessionRevision)
    if (shouldInvalidateSession({
      status: error.response?.status,
      errorCode: error.response?.data?.error,
      requestRevision,
      currentRevision: sessionRevision,
      sessionTransitioning: sessionTransitionDepth > 0,
      isSessionTransitionRequest,
    })) {
      setCsrfToken(null)
      setActiveTenantId(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('contexthub:session-expired'))
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),

  session: () =>
    apiClient.get('/auth/session'),

  switchTenant: async (tenantId) => {
    sessionTransitionDepth += 1
    try {
      return await apiClient.post('/auth/switch-tenant', { tenantId })
    } finally {
      sessionTransitionDepth = Math.max(0, sessionTransitionDepth - 1)
    }
  },

  logout: () =>
    apiClient.post('/auth/logout', {}),

  logoutAll: () =>
    apiClient.post('/auth/logout-all', {}),
  
  register: (userData) =>
    apiClient.post('/auth/register', userData),
  
  me: () =>
    apiClient.get('/auth/session'),
  
  forgotPassword: (email) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    apiClient.post('/auth/reset-password', { token, password }),

  verifyEmail: (token) =>
    apiClient.post('/auth/verify-email', { token }),

  resendVerification: (email) =>
    apiClient.post('/auth/resend-verification', { email }),

  previewInvitation: (token) =>
    apiClient.get('/auth/invitations/preview', { params: { token } }),

  acceptInvitation: ({ token, password, firstName, lastName }) =>
    apiClient.post('/auth/invitations/accept', {
      token,
      ...(password ? { password } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    }),
}

// Users API
export const usersAPI = {
  getUsers: (params) =>
    apiClient.get('/users', { params }),
  
  getUser: (id) =>
    apiClient.get(`/users/${id}`),
  
  createUser: (userData) =>
    apiClient.post('/users', userData),
  
  updateUser: (id, userData) =>
    apiClient.put(`/users/${id}`, userData),
  
  deleteUser: (id) =>
    apiClient.delete(`/users/${id}`),

  reinviteUser: (id) =>
    apiClient.post(`/users/${id}/reinvite`),
}

// Activities API
export const activitiesAPI = {
  getActivities: (params) =>
    apiClient.get('/activities', { params }),
  
  getRecentActivities: (limit = 10, tenantIdOverride) => {
    const tenantId = tenantIdOverride || activeTenantId
    return apiClient.get('/activities/recent', { 
      params: { limit, tenantId } 
    })
  },
}
