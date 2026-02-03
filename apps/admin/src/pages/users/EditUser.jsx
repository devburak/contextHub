import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { userAPI } from '../../lib/userAPI.js'
import { roleAPI } from '../../lib/roleAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { PERMISSIONS } from '../../constants/permissions.js'

export default function EditUser() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasPermission, role: currentUserRole } = useAuth()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    role: 'viewer',
    status: 'active'
  })
  const [isInitialized, setIsInitialized] = useState(false)
  const [initialRole, setInitialRole] = useState(null)

  // Kullanıcı bilgilerini getir
  const { data: userResponse, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => userAPI.getUser(id),
    enabled: !!id,
  })

  const { data: rolesResponse, isLoading: rolesLoading, error: rolesError } = useQuery({
    queryKey: ['roles'],
    queryFn: roleAPI.getRoles,
  })

  const availableRoles = useMemo(() => {
    if (!rolesResponse?.roles || !Array.isArray(rolesResponse.roles)) {
      return []
    }

    return rolesResponse.roles
      .map((role) => ({
        id: role.id || role._id || role.key,
        key: role.key,
        name: role.name || role.key,
      }))
      .filter((role) => role.key)
  }, [rolesResponse])

  const user = useMemo(() => userResponse?.user ?? null, [userResponse])

  const currentStatus = user?.membership?.status || formData.status
  const canManageUsers = currentUserRole === 'owner' || hasPermission(PERMISSIONS.USERS_MANAGE)
  const canAssignRole = currentUserRole === 'owner' || hasPermission(PERMISSIONS.USERS_ASSIGN_ROLE)
  const effectiveRole = user?.membership?.role || user?.role || formData.role
  const isOwnerMember = effectiveRole === 'owner'
  const canDetachUser = canManageUsers && !isOwnerMember

  // Kullanıcı güncelleme
  const updateUserMutation = useMutation({
    mutationFn: async ({ role }) => {
      const updates = {}

      if (role) {
        updates.role = await userAPI.updateUserRole(id, role)
      }

      return updates
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      queryClient.invalidateQueries(['user', id])
      navigate('/users')
    },
    onError: (error) => {
      console.error('Kullanıcı güncelleme hatası:', error.response?.data?.message || error.message)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: () => userAPI.toggleUserStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      queryClient.invalidateQueries(['user', id])
    },
    onError: (error) => {
      console.error('Kullanıcı durumu güncelleme hatası:', error.response?.data?.message || error.message)
    }
  })

  const detachUserMutation = useMutation({
    mutationFn: () => userAPI.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      navigate('/users')
    },
    onError: (error) => {
      console.error('Kullanıcı tenant bağlantısı kaldırma hatası:', error.response?.data?.message || error.message)
    }
  })

  // Form verilerini kullanıcı bilgileriyle doldur
  useEffect(() => {
    if (user && !isInitialized) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        username: user.username || user.email?.split('@')[0] || '',
        role: user.membership?.role || user.role || availableRoles[0]?.key || 'viewer',
        status: user.status || user.membership?.status || 'active'
      })
      setInitialRole(user.membership?.role || user.role || availableRoles[0]?.key || null)
      setIsInitialized(true)
    }
  }, [user, availableRoles, isInitialized])

  useEffect(() => {
    setIsInitialized(false)
    setInitialRole(null)
  }, [id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const roleChanged = formData.role && formData.role !== initialRole

    updateUserMutation.mutate({
      role: roleChanged ? formData.role : null,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Kullanıcı bilgileri yüklenirken hata oluştu</div>
        <button 
          onClick={() => navigate('/users')}
          className="text-blue-600 hover:text-blue-500"
        >
          Kullanıcı listesine dön
        </button>
      </div>
    )
  }

  if (!isLoading && !user) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Kullanıcı bulunamadı veya erişim izniniz yok.</div>
        <button
          onClick={() => navigate('/users')}
          className="text-blue-600 hover:text-blue-500"
        >
          Kullanıcı listesine dön
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Kullanıcı Düzenle
          </h2>
          {user && (
            <p className="mt-1 text-sm text-gray-500">
              {user.firstName} {user.lastName} kullanıcısının bilgilerini düzenleyin
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
          <div className="grid grid-cols-6 gap-6">
            {/* First Name */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                Ad
              </label>
              <input
                type="text"
                name="firstName"
                id="firstName"
                required
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 shadow-sm sm:text-sm"
                value={formData.firstName}
                readOnly
              />
            </div>

            {/* Last Name */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                Soyad
              </label>
              <input
                type="text"
                name="lastName"
                id="lastName"
                required
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 shadow-sm sm:text-sm"
                value={formData.lastName}
                readOnly
              />
            </div>

            {/* Email */}
            <div className="col-span-6 sm:col-span-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                E-posta Adresi
              </label>
              <input
                type="email"
                name="email"
                id="email"
                required
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 shadow-sm sm:text-sm"
                value={formData.email}
                readOnly
              />
            </div>

            {/* Username */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                name="username"
                id="username"
                required
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 shadow-sm sm:text-sm"
                value={formData.username}
                readOnly
              />
            </div>

            <div className="col-span-6 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Kullanıcı bilgileri yalnızca kullanıcının kendisi tarafından değiştirilebilir.
            </div>

            {/* Role */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Rol
              </label>
              <select
                id="role"
                name="role"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                value={formData.role}
                onChange={handleChange}
                disabled={rolesLoading || !canAssignRole}
              >
                {availableRoles.length > 0 ? (
                  availableRoles.map((role) => (
                    <option key={role.id || role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="viewer">Görüntüleyici</option>
                    <option value="editor">Editör</option>
                    <option value="admin">Yönetici</option>
                  </>
                )}
              </select>
              {rolesError && (
                <p className="mt-1 text-sm text-red-600">
                  Roller yüklenemedi. Lütfen sayfayı yenileyin.
                </p>
              )}
            </div>

            {/* Status */}
            <div className="col-span-6 sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">
                Durum
              </label>
              <div className="mt-1 flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {currentStatus === 'active' ? 'Aktif' : currentStatus === 'inactive' ? 'Pasif' : currentStatus}
                </span>
                {canManageUsers && (
                  <button
                    type="button"
                    onClick={() => toggleStatusMutation.mutate()}
                    disabled={toggleStatusMutation.isPending}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {currentStatus === 'active' ? 'Pasif yap' : 'Aktif yap'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          {canManageUsers && isOwnerMember && (
            <div className="mr-auto text-xs text-gray-500 self-center">
              Sahip rolündeki kullanıcılar varlık ilişkisini yalnızca kendi profillerinden kaldırabilir.
            </div>
          )}
          {canDetachUser && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Bu kullanıcının varlıkla ilişkisini kesmek istediğinize emin misiniz?')) {
                  detachUserMutation.mutate()
                }
              }}
              disabled={detachUserMutation.isPending}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-red-600 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Varlıkla ilişkisini kes
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={updateUserMutation.isPending || !canAssignRole}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {updateUserMutation.isPending ? 'Güncelleniyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>

        {updateUserMutation.isError && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">
              Kullanıcı güncellenirken hata oluştu. Lütfen tekrar deneyin.
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
