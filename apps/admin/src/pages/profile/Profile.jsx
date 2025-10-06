import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userAPI } from '../../lib/userAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { PERMISSION_LABELS } from '../../constants/permissionLabels.js'

export default function Profile() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { updateUserProfile, roleMeta, permissions } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: userAPI.getCurrentUser
  })

  const profile = data?.user
  const currentMembership = data?.currentMembership

  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: ''
    }
  })

  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || ''
      })
    }
  }, [profile, reset])

  const onSubmit = async (values) => {
    try {
      const response = await userAPI.updateProfile(values)
      const updatedUser = {
        ...(profile || {}),
        ...response.user
      }
      updateUserProfile(updatedUser)
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      toast.success('Profiliniz güncellendi')
    } catch (error) {
      const message = error?.response?.data?.message || 'Profil güncellenemedi'
      toast.error(message)
    }
  }

  const renderPermissions = (list = []) => {
    if (!list.length) {
      return <p className="text-sm text-gray-500">Bu rol için atanmış yetki yok.</p>
    }

    return (
      <div className="flex flex-wrap gap-2">
        {list.map((permission, index) => (
          <span
            key={`${permission}-${index}`}
            className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
          >
            {PERMISSION_LABELS[permission] || permission}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl">
        <div className="border-b border-gray-200 pb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Profil Ayarları</h1>
          <p className="mt-1 text-sm text-gray-500">Kişisel bilgilerinizi yönetin ve mevcut rolünüzü görüntüleyin.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Kişisel Bilgiler</h2>
              </div>

              {isLoading ? (
                <div className="p-6 text-sm text-gray-500">Bilgiler yükleniyor...</div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ad</label>
                      <input
                        type="text"
                        {...register('firstName', { required: true })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Soyad</label>
                      <input
                        type="text"
                        {...register('lastName', { required: true })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">E-posta</label>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                    <button
                      type="submit"
                      disabled={formState.isSubmitting || !formState.isDirty}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {formState.isSubmitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Aktif Rol</h2>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{roleMeta?.name || currentMembership?.role || 'Bilinmiyor'}</p>
                  <p className="text-xs text-gray-500">Seviye: {roleMeta?.level ?? currentMembership?.level ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Yetkiler</p>
                  {renderPermissions(permissions || currentMembership?.permissions)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h2 className="text-sm font-medium text-gray-700">Diğer Varlık Erişimleri</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {(data?.allMemberships || []).map((membership) => (
                  <div
                    key={membership.id || `${membership.tenantId}-${membership.role}`}
                    className="p-4 text-sm"
                  >
                    <p className="font-medium text-gray-900">{membership.tenant?.name || 'Varlık'}</p>
                    <p className="text-xs text-gray-500">Rol: {membership.roleMeta?.name || membership.role}</p>
                    <p className="mt-1 text-xs text-gray-400">Yetki sayısı: {membership.permissions?.length || 0}</p>
                  </div>
                ))}
                {!data?.allMemberships?.length && (
                  <div className="p-4 text-sm text-gray-500">Başka bir varlık erişiminiz bulunmuyor.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
