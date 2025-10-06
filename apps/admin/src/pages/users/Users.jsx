import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { usersAPI } from '../../lib/api.js'

export default function Users() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users', search],
    queryFn: () => usersAPI.getUsers({ search }).then(res => res.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => usersAPI.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete user "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 text-center">
        Error loading users: {error.message}
      </div>
    )
  }

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
          <p className="mt-2 text-sm text-gray-700">
            {t('users.description')}
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <Link
            to="/users/create"
            className="btn-primary inline-flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            {t('users.add_user')}
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-4">
          <input
            type="text"
            placeholder={t('users.search')}
            className="input max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="card">
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                    {t('users.name')}
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    {t('users.email')}
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    {t('users.role')}
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    {t('users.status')}
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    {t('users.created')}
                  </th>
                  <th className="relative py-3.5 pl-3 pr-4">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users?.data?.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {t(`role.${user.role}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {t(`status.${user.status}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/users/${user._id}/edit`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(user._id, user.name)}
                          className="text-red-600 hover:text-red-900"
                          disabled={deleteMutation.isPending}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {users?.data?.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">{t('users.no_users')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
