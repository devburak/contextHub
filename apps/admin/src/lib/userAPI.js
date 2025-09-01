import { apiClient } from './api.js'

export const userAPI = {
  // Tüm kullanıcıları getir
  getUsers: async (params = {}) => {
    const { data } = await apiClient.get('/users', { params })
    return data
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
    const { data } = await apiClient.patch(`/users/${id}/role`, { role })
    return data
  }
}
