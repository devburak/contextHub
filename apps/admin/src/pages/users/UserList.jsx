import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  MagnifyingGlassIcon,
  UserCircleIcon,
  CheckBadgeIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { userAPI } from '../../lib/userAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'

const ROLE_PRESENTATION = {
  owner: { className: 'bg-red-100 text-red-800', label: 'Sahip' },
  admin: { className: 'bg-purple-100 text-purple-800', label: 'Yönetici' },
  editor: { className: 'bg-blue-100 text-blue-800', label: 'Editör' },
  author: { className: 'bg-green-100 text-green-800', label: 'Yazar' },
  viewer: { className: 'bg-gray-100 text-gray-800', label: 'Görüntüleyici' }
}

const STATUS_PRESENTATION = {
  active: { label: 'Aktif', className: 'bg-green-50 text-green-700 ring-green-200' },
  inactive: { label: 'Pasif', className: 'bg-gray-50 text-gray-600 ring-gray-200' },
  pending: { label: 'Davet Bekliyor', className: 'bg-amber-50 text-amber-700 ring-amber-200' }
}

export default function UserList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const queryClient = useQueryClient()
  const toast = useToast()

  // Kullanıcıları getir
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users', { search: searchTerm, status: statusFilter, role: roleFilter }],
    queryFn: () => userAPI.getUsers({ 
      search: searchTerm, 
      status: statusFilter !== 'all' ? statusFilter : undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined 
    }),
  })

  // Kullanıcı silme
  const deleteUserMutation = useMutation({
    mutationFn: ({ id }) => userAPI.deleteUser(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['users'])
      const label = variables?.name ? `"${variables.name}"` : 'Kullanıcı'
      toast.success(`${label} tenant bağlantısından çıkarıldı.`)
    },
    onError: (error) => {
      const message = error.response?.data?.message || 'Kullanıcı tenant bağlantısı kaldırılamadı.'
      toast.error(message)
    }
  })

  // Kullanıcı durumu değiştirme
  const toggleStatusMutation = useMutation({
    mutationFn: (id) => userAPI.toggleUserStatus(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['users'])
      const status = data?.membership?.status
      if (status === 'active') {
        toast.success('Kullanıcı yeniden aktifleştirildi.')
      } else if (status === 'inactive') {
        toast.info('Kullanıcı pasif hale getirildi.')
      } else {
        toast.success('Kullanıcı durumu güncellendi.')
      }
    },
    onError: (error) => {
      const message = error.response?.data?.message || 'Kullanıcı durumu güncellenemedi.'
      toast.error(message)
    }
  })

  const reinviteUserMutation = useMutation({
    mutationFn: ({ id }) => userAPI.reinviteUser(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['users'])
      const label = variables?.email || variables?.name || 'Kullanıcı'
      toast.success(`${label} için davet e-postası yeniden gönderildi.`)
    },
    onError: (error) => {
      const message = error.response?.data?.message || 'Davet gönderilirken bir hata oluştu.'
      toast.error(message)
    }
  })

  const handleDeleteUser = async (user) => {
    const nameLabel = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
    if (window.confirm(`"${nameLabel}" kullanıcısının tenant erişimini kaldırmak istediğinizden emin misiniz?`)) {
      deleteUserMutation.mutate({ id: user.id, name: nameLabel })
    }
  }

  const handleReinviteUser = (user) => {
    reinviteUserMutation.mutate({ id: user.id, email: user.email, name: `${user.firstName || ''} ${user.lastName || ''}`.trim() })
  }

  const handleToggleStatus = (id) => {
    toggleStatusMutation.mutate(id)
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
        <div className="text-red-600 mb-4">Kullanıcılar yüklenirken hata oluştu</div>
        <button 
          onClick={() => queryClient.invalidateQueries(['users'])}
          className="text-blue-600 hover:text-blue-500"
        >
          Tekrar dene
        </button>
      </div>
    )
  }

  const filteredUsers = users?.data || []
  const pagination = users?.pagination
  const totalUsers = pagination?.totalDocs ?? 0
  const pageLimit = pagination?.limit ?? 10
  const currentOffset = pagination?.offset ?? 0
  const startIndex = totalUsers === 0 ? 0 : currentOffset + 1
  const endIndex = totalUsers === 0 ? 0 : Math.min(currentOffset + pageLimit, totalUsers)
  const hasPrevPage = Boolean(pagination?.hasPrevPage)
  const hasNextPage = Boolean(pagination?.hasNextPage)

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Kullanıcılar</h1>
          <p className="mt-2 text-sm text-gray-700">
            Sistemdeki tüm kullanıcıları görüntüleyin ve yönetin.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            to="/users/new"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Yeni Kullanıcı
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <select
          className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tüm Durumlar</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
          <option value="pending">Davet Bekliyor</option>
        </select>

        {/* Role Filter */}
        <select
          className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Tüm Roller</option>
          <option value="owner">Sahip</option>
          <option value="admin">Yönetici</option>
          <option value="editor">Editör</option>
          <option value="viewer">Görüntüleyici</option>
        </select>
      </div>

      {/* User Table */}
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kullanıcı
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      E-posta
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Durum
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kayıt Tarihi
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                        Hiç kullanıcı bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const roleInfo = ROLE_PRESENTATION[user.role] || ROLE_PRESENTATION.viewer
                      const createdAtDate = user.createdAt ? new Date(user.createdAt) : null
                      const createdAtLabel = createdAtDate && !Number.isNaN(createdAtDate.getTime())
                        ? createdAtDate.toLocaleDateString('tr-TR')
                        : '-'

                      return (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                {user.avatar ? (
                                  <img
                                    className="h-10 w-10 rounded-full"
                                    src={user.avatar}
                                    alt=""
                                  />
                                ) : (
                                  <UserCircleIcon className="h-10 w-10 text-gray-400" />
                                )}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {user.username ? `@${user.username}` : '-'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${roleInfo.className}`}>
                              {roleInfo.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const statusInfo = STATUS_PRESENTATION[user.status] || STATUS_PRESENTATION.inactive
                                  return (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusInfo.className}`}>
                                      {user.status === 'active' ? (
                                        <CheckBadgeIcon className="h-3.5 w-3.5" />
                                      ) : user.status === 'pending' ? (
                                        <ArrowPathIcon className="h-3.5 w-3.5" />
                                      ) : (
                                        <XCircleIcon className="h-3.5 w-3.5" />
                                      )}
                                      {statusInfo.label}
                                    </span>
                                  )
                                })()}

                                {user.status === 'active' && (
                                  <button
                                    onClick={() => handleToggleStatus(user.id)}
                                    disabled={toggleStatusMutation.isPending}
                                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                                  >
                                    Pasifleştir
                                  </button>
                                )}

                                {user.status === 'inactive' && (
                                  <button
                                    onClick={() => handleToggleStatus(user.id)}
                                    disabled={toggleStatusMutation.isPending}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                  >
                                    Aktifleştir
                                  </button>
                                )}
                              </div>
                              {/* Davet bilgileri - pending veya inactive için */}
                              {(user.status === 'pending' || user.status === 'inactive') && user.lastInvitedAt && (
                                <div className="text-xs text-gray-500">
                                  <span>Davet: {new Date(user.lastInvitedAt).toLocaleDateString('tr-TR')}</span>
                                  {user.inviteExpiresAt && (
                                    <span className={`ml-2 ${new Date(user.inviteExpiresAt) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                                      {new Date(user.inviteExpiresAt) < new Date() ? '(Süresi doldu)' : `(${new Date(user.inviteExpiresAt).toLocaleDateString('tr-TR')} tarihine kadar)`}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {createdAtLabel}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                to={`/users/${user.id}/edit`}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </Link>
                              {(user.status === 'pending' || user.status === 'inactive') && (
                                <button
                                  onClick={() => handleReinviteUser(user)}
                                  disabled={reinviteUserMutation.isPending}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200"
                                >
                                  <ArrowPathIcon className="h-3.5 w-3.5" />
                                  Daveti Yenile
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteUser(user)}
                                disabled={deleteUserMutation.isPending}
                                className="text-red-600 hover:text-red-900"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              disabled={!hasPrevPage}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              disabled={!hasNextPage}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                {totalUsers === 0 ? (
                  <>
                    Toplam <span className="font-medium">0</span> kullanıcı bulunmuyor.
                  </>
                ) : (
                  <>
                    Toplam <span className="font-medium">{totalUsers}</span> kullanıcıdan{' '}
                    <span className="font-medium">{startIndex}</span> -{' '}
                    <span className="font-medium">{endIndex}</span>{' '}
                    arası gösteriliyor
                  </>
                )}
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  disabled={!hasPrevPage}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Önceki
                </button>
                <button
                  disabled={!hasNextPage}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Sonraki
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
