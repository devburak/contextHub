import { apiClient } from './api.js'

export const userAPI = {
  // Tüm kullanıcıları getir
  getUsers: async (params = {}) => {
    const { data } = await apiClient.get('/users', { params })
    const rawUsers = Array.isArray(data?.users) ? data.users : []

    const mappedUsers = rawUsers.map((user) => {
      const createdAtDate = user.createdAt ? new Date(user.createdAt) : null
      const lastLoginDate = user.lastLoginAt ? new Date(user.lastLoginAt) : null

      const createdAt = createdAtDate && !Number.isNaN(createdAtDate.getTime())
        ? createdAtDate.toISOString()
        : null
      const lastLoginAt = lastLoginDate && !Number.isNaN(lastLoginDate.getTime())
        ? lastLoginDate.toISOString()
        : null

      return {
        id: user.id || user._id || '',
        email: user.email || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || (user.email ? user.email.split('@')[0] : ''),
        role: user.role || 'viewer',
        status: user.status || 'active',
        createdAt,
        lastLoginAt
      }
    })

    const pagination = (() => {
      if (!data?.pagination) {
        return null
      }

      const {
        page = 1,
        limit = 10,
        total = 0,
        pages = 0,
        offset = 0,
        hasPrevPage = false,
        hasNextPage = false
      } = data.pagination

      const totalDocs = Number.isFinite(total) ? total : 0
      const pageSize = Number.isFinite(limit) && limit > 0 ? limit : 10
      const currentOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0

      return {
        page,
        limit: pageSize,
        totalDocs,
        totalPages: pages,
        offset: currentOffset,
        hasPrevPage,
        hasNextPage
      }
    })()

    return {
      data: mappedUsers,
      pagination
    }
  },

  // Tek kullanıcı getir
  getUser: async (id) => {
    const { data } = await apiClient.get(`/users/${id}`)
    return data
  },

  // Yeni kullanıcı oluştur
  createUser: async (userData) => {
    const { data } = await apiClient.post('/users', userData)
    return data
  },

  // Kullanıcı güncelle
  updateUser: async (id, userData) => {
    const { data } = await apiClient.put(`/users/${id}`, userData)
    return data
  },

  // Kullanıcı sil
  deleteUser: async (id) => {
    const { data } = await apiClient.delete(`/users/${id}`)
    return data
  },

  // Kullanıcı durumunu değiştir (aktif/pasif)
  toggleUserStatus: async (id) => {
    const { data } = await apiClient.patch(`/users/${id}/toggle-status`)
    return data
  },

  // Kullanıcı şifresini sıfırla
  resetUserPassword: async (id) => {
    const { data } = await apiClient.post(`/users/${id}/reset-password`)
    return data
  },

  // Kullanıcı rolünü değiştir
  updateUserRole: async (id, role) => {
    const { data } = await apiClient.put(`/users/${id}/role`, { role })
    return data
  },

  // Aktif kullanıcı bilgilerini getir
  getCurrentUser: async () => {
    const { data } = await apiClient.get('/users/me')
    return data
  },

  // Profil bilgilerini güncelle
  updateProfile: async (profileData) => {
    const { data } = await apiClient.put('/users/me', profileData)
    return data
  }
}
