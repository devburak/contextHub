import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
let csrfToken = null
let activeTenantId = null

export const setCsrfToken = (value) => {
  csrfToken = value || null
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
    const authInvalidatingErrors = new Set([
      'AccountDisabled',
      'EmailVerificationRequired',
      'SessionTenantMismatch',
    ])
    if (
      error.response?.status === 401
      || authInvalidatingErrors.has(error.response?.data?.error)
    ) {
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

  switchTenant: (tenantId) =>
    apiClient.post('/auth/switch-tenant', { tenantId }),

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
