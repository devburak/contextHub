import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { roleAPI } from '../../lib/roleAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  expandPermissions,
  stripManagePermissions,
  normalizePermissionsForSave
} from '../../constants/permissions.js'
import { PERMISSION_LABELS, PERMISSION_GROUP_LABELS } from '../../constants/permissionLabels.js'
import { ROLE_LEVELS, ROLE_LEVEL_MAP, ROLE_LABELS } from '../../constants/roles.js'

const slugifyKey = (value = '') => value
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')

const preparePermissions = (permissions = []) => stripManagePermissions(expandPermissions(permissions))

const RoleForm = ({ mode, initialRole, systemRoles, onCancel, onSubmit, isSubmitting }) => {
  const { t } = useTranslation()
  const isEdit = mode === 'edit'
  const initialPermissions = useMemo(
    () => preparePermissions(initialRole?.permissions || []),
    [initialRole]
  )
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      name: initialRole?.name || '',
      key: initialRole?.key || '',
      description: initialRole?.description || '',
      baseRoleKey: initialRole?.roleMeta?.key || '',
      level: initialRole?.level ?? ROLE_LEVEL_MAP.editor,
      permissions: initialPermissions
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

  const toggleGroup = (groupPermissions = []) => {
    const next = new Set(selectedPermissions)
    const allSelected = groupPermissions.every((permission) => next.has(permission))

    if (allSelected) {
      groupPermissions.forEach((permission) => next.delete(permission))
    } else {
      groupPermissions.forEach((permission) => next.add(permission))
    }

    setValue('permissions', Array.from(next), { shouldDirty: true })
  }

  const handleBaseRoleChange = (event) => {
    const key = event.target.value
    setValue('baseRoleKey', key)
    if (!key) return
    const baseRole = systemRoles.find((role) => role.key === key)
    if (baseRole) {
      setValue('level', baseRole.level)
      setValue('permissions', preparePermissions(baseRole.permissions || []), { shouldDirty: true })
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
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? t('users.roles.edit_title') : t('users.roles.create_title')}</h2>
          <p className="text-sm text-gray-500">
            {t('users.roles.form_description')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('users.roles.name_label')}</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder={t('users.roles.name_placeholder')}
              {...register('name', { required: true })}
              onBlur={handleNameBlur}
              disabled={isEdit && initialRole?.isSystem}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('users.roles.key_label')}</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder={t('users.roles.key_placeholder')}
              {...register('key', { required: true })}
              disabled={isEdit}
            />
            <p className="mt-1 text-xs text-gray-500">{t('users.roles.key_hint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('users.roles.level_label')}</label>
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
            <p className="mt-1 text-xs text-gray-500">{t('users.roles.level_hint')}</p>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('users.roles.base_role_label')}</label>
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={baseRoleKey || ''}
                onChange={handleBaseRoleChange}
              >
                <option value="">{t('users.roles.base_role_placeholder')}</option>
                {systemRoles.map((role) => (
                  <option key={role.id} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">{t('users.roles.base_role_hint')}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('common.description')}</label>
            <textarea
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder={t('users.roles.description_placeholder')}
              {...register('description')}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">{t('users.roles.permissions')}</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {Object.entries(PERMISSION_GROUPS).map(([groupKey, permissions]) => (
              <fieldset key={groupKey} className="border border-gray-200 rounded-md p-3">
                <legend className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-700">
                  <span>{PERMISSION_GROUP_LABELS[groupKey] || groupKey}</span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(permissions)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {permissions.every((permission) => selectedPermissions.includes(permission))
                      ? t('common.clear')
                      : t('common.select_all')}
                  </button>
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

const summarizePermissions = (permissions = [], t) => {
  const expanded = preparePermissions(permissions)
  if (!expanded.length) return t('users.roles.permission_count', { count: 0 })
  if (expanded.length <= 3) {
    return expanded.map((permission) => PERMISSION_LABELS[permission] || permission).join(', ')
  }
  return t('users.roles.permission_count', { count: expanded.length })
}

export default function Roles() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const describeError = useApiError()
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
  const [expandedRoleIds, setExpandedRoleIds] = useState(() => new Set())

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
        const permissions = normalizePermissionsForSave(values.permissions)
        await roleAPI.updateRole(formState.role.id, {
          name: values.name,
          description: values.description,
          level: values.level,
          permissions
        })
        toast.success(t('users.roles.update_success'))
      } else {
        const permissions = normalizePermissionsForSave(values.permissions)
        await roleAPI.createRole({
          name: values.name,
          key: values.key,
          description: values.description,
          level: values.level,
          permissions,
          baseRoleKey: values.baseRoleKey || undefined
        })
        toast.success(t('users.roles.create_success'))
      }

      await queryClient.invalidateQueries({ queryKey: ['roles'] })
      setFormState({ mode: null, role: null })
    } catch (error) {
      toast.error(describeError(error, 'users.roles.save_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (role) => {
    if (!canManageRoles) return
    const confirmed = window.confirm(t('users.roles.delete_confirm', { name: role.name }))
    if (!confirmed) return

    try {
      await roleAPI.deleteRole(role.id)
      toast.success(t('users.roles.delete_success'))
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
    } catch (error) {
      toast.error(describeError(error, 'users.roles.delete_error'))
    }
  }

  const toggleExpanded = (roleId) => {
    setExpandedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
      } else {
        next.add(roleId)
      }
      return next
    })
  }

  const groupPermissions = (permissions = []) => {
    const expanded = preparePermissions(permissions)
    if (!expanded.length) return []

    const permissionSet = new Set(expanded)
    return Object.entries(PERMISSION_GROUPS)
      .map(([groupKey, groupPermissions]) => ({
        groupKey,
        permissions: groupPermissions.filter((permission) => permissionSet.has(permission))
      }))
      .filter((group) => group.permissions.length > 0)
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('users.roles.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('users.roles.description')}
          </p>
        </div>
        {canManageRoles && (
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            {t('users.roles.new_role')}
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
        <div className="py-10 text-center text-sm text-gray-500">{t('common.loading')}</div>
      )}

      {isError && (
        <div className="py-10 text-center text-sm text-red-600">
          {describeError(error, 'user.roles_load_error')}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('users.role')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('users.roles.key_label')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('users.roles.level')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('users.roles.scope')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('users.roles.permissions')}</th>
                {canManageRoles && (
                  <th scope="col" className="relative px-4 py-3"><span className="sr-only">{t('common.actions')}</span></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {roles.map((role) => {
                const isExpanded = expandedRoleIds.has(role.id)
                const groupedPermissions = groupPermissions(role.permissions)
                const permissionsSummary = summarizePermissions(role.permissions, t)
                return (
                  <>
                    <tr key={role.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {role.name}
                        {role.isSystem && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            {t('users.roles.system_badge')}
                          </span>
                        )}
                        {role.isDefault && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            {t('users.roles.default_badge')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{role.key}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {ROLE_LABELS[role.key] || role.level}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {role.tenantId ? t('users.roles.scope_tenant') : t('users.roles.scope_global')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <span>{permissionsSummary}</span>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(role.id)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            {isExpanded ? t('users.roles.hide') : t('common.details')}
                          </button>
                        </div>
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
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(role)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:text-gray-300"
                              disabled={role.isSystem}
                            >
                              <TrashIcon className="h-4 w-4" />
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td
                          className="px-4 py-4 text-sm text-gray-600"
                          colSpan={canManageRoles ? 6 : 5}
                        >
                          {groupedPermissions.length ? (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              {groupedPermissions.map((group) => (
                                <div key={group.groupKey}>
                                  <p className="text-xs font-semibold text-gray-700">
                                    {PERMISSION_GROUP_LABELS[group.groupKey] || group.groupKey}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {group.permissions
                                      .map((permission) => PERMISSION_LABELS[permission] || permission)
                                      .join(', ')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">{t('users.roles.no_permissions')}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
