import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { roleAPI } from '../../lib/roleAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { PERMISSIONS, PERMISSION_GROUPS } from '../../constants/permissions.js'
import { PERMISSION_LABELS, PERMISSION_GROUP_LABELS } from '../../constants/permissionLabels.js'
import { ROLE_LEVELS, ROLE_LEVEL_MAP, ROLE_LABELS } from '../../constants/roles.js'

const slugifyKey = (value = '') => value
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')

const RoleForm = ({ mode, initialRole, systemRoles, onCancel, onSubmit, isSubmitting }) => {
  const isEdit = mode === 'edit'
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      name: initialRole?.name || '',
      key: initialRole?.key || '',
      description: initialRole?.description || '',
      baseRoleKey: initialRole?.roleMeta?.key || '',
      level: initialRole?.level ?? ROLE_LEVEL_MAP.editor,
      permissions: initialRole?.permissions ? [...initialRole.permissions] : []
    }
  })

  const selectedPermissions = watch('permissions') || []
  const baseRoleKey = watch('baseRoleKey')

  const togglePermission = (permission) => {
    const next = selectedPermissions.includes(permission)
      ? selectedPermissions.filter((item) => item !== permission)
      : [...selectedPermissions, permission]
    setValue('permissions', next, { shouldDirty: true })
  }

  const handleBaseRoleChange = (event) => {
    const key = event.target.value
    setValue('baseRoleKey', key)
    if (!key) return
    const baseRole = systemRoles.find((role) => role.key === key)
    if (baseRole) {
      setValue('level', baseRole.level)
      setValue('permissions', [...(baseRole.permissions || [])])
    }
  }

  const handleNameBlur = (event) => {
    if (isEdit) return
    const generatedKey = slugifyKey(event.target.value)
    if (generatedKey && !watch('key')) {
      setValue('key', generatedKey)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-gray-100 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Rolü düzenle' : 'Yeni rol oluştur'}</h2>
          <p className="text-sm text-gray-500">
            Rollerin yetkilerini tanımlayın ve kullanıcılarınıza atayın.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Rol adı</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="Örn. İçerik Editörü"
              {...register('name', { required: true })}
              onBlur={handleNameBlur}
              disabled={isEdit && initialRole?.isSystem}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Anahtar</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="ornek-rol"
              {...register('key', { required: true })}
              disabled={isEdit}
            />
            <p className="mt-1 text-xs text-gray-500">Bu değer API entegrasyonlarında kullanılacaktır.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Rol seviyesi</label>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              {...register('level', { valueAsNumber: true })}
              disabled={isEdit && initialRole?.isSystem}
            >
              {ROLE_LEVELS.map((role) => (
                <option key={role.key} value={role.level}>
                  {role.label} ({role.level})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Daha yüksek seviyedeki roller varsayılan olarak daha geniş erişime sahiptir.</p>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Temel rol</label>
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={baseRoleKey || ''}
                onChange={handleBaseRoleChange}
              >
                <option value="">Seçiniz (isteğe bağlı)</option>
                {systemRoles.map((role) => (
                  <option key={role.id} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Bir temel rol seçerseniz izinler otomatik olarak kopyalanır.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Açıklama</label>
            <textarea
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="Bu rolün kullanım amacı..."
              {...register('description')}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">Yetkiler</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {Object.entries(PERMISSION_GROUPS).map(([groupKey, permissions]) => (
              <fieldset key={groupKey} className="border border-gray-200 rounded-md p-3">
                <legend className="text-sm font-semibold text-gray-700">
                  {PERMISSION_GROUP_LABELS[groupKey] || groupKey}
                </legend>
                <div className="mt-2 space-y-2">
                  {permissions.map((permission) => (
                    <label key={permission} className="flex items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedPermissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                      <span>{PERMISSION_LABELS[permission] || permission}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </div>
    </form>
  )
}

const summarizePermissions = (permissions = []) => {
  if (!permissions.length) return '0 yetki'
  if (permissions.length <= 3) {
    return permissions.map((permission) => PERMISSION_LABELS[permission] || permission).join(', ')
  }
  return `${permissions.length} yetki`
}

export default function Roles() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canManageRoles = hasPermission(PERMISSIONS.ROLES_MANAGE)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roles'],
    queryFn: roleAPI.getRoles,
    retry: false
  })

  const roles = data?.roles || []
  const systemRoles = useMemo(() => roles.filter((role) => role.isSystem), [roles])

  const [formState, setFormState] = useState({ mode: null, role: null })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreate = () => {
    setFormState({ mode: 'create', role: null })
  }

  const handleEdit = (role) => {
    setFormState({ mode: 'edit', role })
  }

  const handleCancel = () => {
    setFormState({ mode: null, role: null })
  }

  const handleSaveRole = async (values) => {
    try {
      setIsSubmitting(true)
      if (formState.mode === 'edit' && formState.role) {
        await roleAPI.updateRole(formState.role.id, {
          name: values.name,
          description: values.description,
          level: values.level,
          permissions: values.permissions
        })
        toast.success('Rol güncellendi')
      } else {
        await roleAPI.createRole({
          name: values.name,
          key: values.key,
          description: values.description,
          level: values.level,
          permissions: values.permissions,
          baseRoleKey: values.baseRoleKey || undefined
        })
        toast.success('Rol oluşturuldu')
      }

      await queryClient.invalidateQueries({ queryKey: ['roles'] })
      setFormState({ mode: null, role: null })
    } catch (error) {
      const message = error?.response?.data?.message || 'Rol kaydedilirken hata oluştu'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (role) => {
    if (!canManageRoles) return
    const confirmed = window.confirm(`${role.name} rolünü silmek istediğinize emin misiniz?`)
    if (!confirmed) return

    try {
      await roleAPI.deleteRole(role.id)
      toast.success('Rol silindi')
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
    } catch (error) {
      const message = error?.response?.data?.message || 'Rol silinemedi'
      toast.error(message)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Roller</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sistem ve tenant düzeyindeki rollerin yetkilerini yönetin.
          </p>
        </div>
        {canManageRoles && (
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Yeni Rol
          </button>
        )}
      </div>

      {formState.mode && canManageRoles && (
        <RoleForm
          mode={formState.mode}
          initialRole={formState.role}
          systemRoles={systemRoles}
          onCancel={handleCancel}
          onSubmit={handleSaveRole}
          isSubmitting={isSubmitting}
        />
      )}

      {isLoading && (
        <div className="py-10 text-center text-sm text-gray-500">Roller yükleniyor...</div>
      )}

      {isError && (
        <div className="py-10 text-center text-sm text-red-600">
          Roller yüklenirken bir hata oluştu. {error?.message && <span className="block mt-1 text-xs text-red-500">{error.message}</span>}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rol</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Anahtar</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Seviye</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Kapsam</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Yetkiler</th>
                {canManageRoles && (
                  <th scope="col" className="relative px-4 py-3"><span className="sr-only">İşlemler</span></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {role.name}
                    {role.isSystem && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        Sistem
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{role.key}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {ROLE_LABELS[role.key] || role.level}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {role.tenantId ? 'Tenant' : 'Global'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {summarizePermissions(role.permissions)}
                  </td>
                  {canManageRoles && (
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      <div className="flex justify-end gap-3 text-blue-600">
                        <button
                          type="button"
                          onClick={() => handleEdit(role)}
                          className="inline-flex items-center gap-1 hover:text-blue-800 disabled:text-gray-300"
                          disabled={role.isSystem}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(role)}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:text-gray-300"
                          disabled={role.isSystem}
                        >
                          <TrashIcon className="h-4 w-4" />
                          Sil
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
