import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Skip tenant ID for auth, subscription-plans, and tenant creation endpoints
  const isAuthRequest = config.url?.startsWith('/auth')
  const isSubscriptionPlansRequest = config.url?.startsWith('/subscription-plans')
  const isTenantCreationRequest = config.url === '/tenants' && config.method?.toLowerCase() === 'post'
  const tenantId = localStorage.getItem('tenantId')

  if (tenantId && !isAuthRequest && !isSubscriptionPlansRequest && !isTenantCreationRequest) {
    config.headers['X-Tenant-ID'] = tenantId
    if (!config.params || typeof config.params !== 'object') {
      config.params = {}
    }
    if (!('tenantId' in config.params)) {
      config.params.tenantId = tenantId
    }
  }
  return config
})

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),
  
  register: (userData) =>
    apiClient.post('/auth/register', userData),
  
  me: () =>
    apiClient.get('/auth/me'),
  
  forgotPassword: (email) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    apiClient.post('/auth/reset-password', { token, password }),
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
  
  getRecentActivities: (limit = 10) => {
    const tenantId = localStorage.getItem('tenantId')
    return apiClient.get('/activities/recent', { 
      params: { limit, tenantId } 
    })
  },
}
