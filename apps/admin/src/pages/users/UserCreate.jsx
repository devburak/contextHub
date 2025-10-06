import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { usersAPI } from '../../lib/api.js'
import { useToast } from '../../contexts/ToastContext.jsx'

export default function UserCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active'
  })
  
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data) => usersAPI.createUser(data),
    onSuccess: (response, variables) => {
      const payload = response?.data ?? {}
      const invite = payload.invite
      const displayName = variables?.name
        || [variables?.firstName, variables?.lastName].filter(Boolean).join(' ').trim()
        || ''
      const inviteExpiresAt = invite?.invitation?.expiresAt
        ? new Date(invite.invitation.expiresAt).toLocaleString('tr-TR')
        : null

      if (invite) {
        const inviteMessage = payload.message
          || (variables?.email
            ? t('user.invite_existing', { email: variables.email })
            : t('user.invite_existing_generic'))
        const composedMessage = inviteExpiresAt
          ? `${inviteMessage} (Son kullanım: ${inviteExpiresAt})`
          : inviteMessage
        toast.info(composedMessage)
      } else {
        const successMessage = displayName
          ? t('user.create_success_named', { name: displayName })
          : t('user.create_success')
        toast.success(successMessage)
      }

      queryClient.invalidateQueries({ queryKey: ['users'] })
      navigate('/users')
    },
    onError: (error) => {
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors)
      }

      const errorPayload = error.response?.data
      const apiMessage = errorPayload?.message

      if (apiMessage) {
        toast.error(apiMessage)
        return
      }

      if (errorPayload?.error === 'UserInvitationFailed') {
        toast.error(t('user.invite_error'))
        return
      }

      toast.error(t('user.create_error'))
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    createMutation.mutate(formData)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear field error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {t('user.back_to_users')}
        </Link>
      </div>

      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('user.create_title')}</h1>
          <p className="mt-2 text-sm text-gray-700">
            {t('user.create_description')}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="card max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="label">
                {t('user.full_name')}
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`input ${errors.name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder={t('user.full_name')}
                required
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="label">
                {t('user.email_address')}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`input ${errors.email ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder={t('user.email_address')}
                required
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                {t('user.password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`input-with-icon ${errors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('user.password')}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <EyeIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {t('user.password_hint')}
              </p>
            </div>

            <div>
              <label htmlFor="role" className="label">
                {t('user.role')}
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="input"
                required
              >
                <option value="user">{t('role.user')}</option>
                <option value="admin">{t('role.admin')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="status" className="label">
                {t('user.status')}
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input"
                required
              >
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link
                to="/users"
                className="btn-secondary"
              >
                {t('user.cancel')}
              </Link>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? t('user.creating') : t('user.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
