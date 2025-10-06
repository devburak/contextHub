import { apiClient } from './api.js'

export const roleAPI = {
  getRoles: async () => {
    try {
      const { data } = await apiClient.get('/roles')
      return data
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Roller servisi bulunamadı. Lütfen API sunucusunu yeniden başlatın.')
      }
      throw error
    }
  },
  createRole: async (payload) => {
    try {
      const { data } = await apiClient.post('/roles', payload)
      return data
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Roller servisi bulunamadı. Lütfen API sunucusunu yeniden başlatın.')
      }
      throw error
    }
  },
  updateRole: async (id, payload) => {
    try {
      const { data } = await apiClient.put(`/roles/${id}`, payload)
      return data
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Roller servisi bulunamadı. Lütfen API sunucusunu yeniden başlatın.')
      }
      throw error
    }
  },
  deleteRole: async (id) => {
    try {
      const { data } = await apiClient.delete(`/roles/${id}`)
      return data
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Roller servisi bulunamadı. Lütfen API sunucusunu yeniden başlatın.')
      }
      throw error
    }
  }
}
