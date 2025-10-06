import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { userAPI } from '../../lib/userAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'

export default function CreateUser() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    role: 'viewer',
    status: 'active'
  })

  const createUserMutation = useMutation({
    mutationFn: userAPI.createUser,
    onSuccess: (data, variables) => {
      const invite = data?.invite
      const displayName = [variables?.firstName, variables?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()
      const inviteExpiresAt = invite?.invitation?.expiresAt
        ? new Date(invite.invitation.expiresAt).toLocaleString('tr-TR')
        : null

      if (invite) {
        const inviteMessage = data?.message
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

      queryClient.invalidateQueries(['users'])
      navigate('/users')
    },
    onError: (error) => {
      const payload = error.response?.data
      const apiMessage = payload?.message

      if (apiMessage) {
        toast.error(apiMessage)
        return
      }

      if (payload?.error === 'UserInvitationFailed') {
        toast.error(t('user.invite_error'))
        return
      }

      toast.error(t('user.create_error'))
    },
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    createUserMutation.mutate(formData)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
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

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label">
                Ad
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="input"
                placeholder="Ad"
                required
              />
            </div>

            <div>
              <label htmlFor="lastName" className="label">
                Soyad
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="input"
                placeholder="Soyad"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="email" className="label">
                E-posta Adresi
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder="ornek@firma.com"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="username" className="label">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="input"
                placeholder="kullaniciadi"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Şifre
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="input-with-icon"
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
              <p className="mt-1 text-sm text-gray-500">{t('user.password_hint')}</p>
            </div>

            <div>
              <label htmlFor="role" className="label">
                Rol
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="input"
              >
                <option value="viewer">Görüntüleyici</option>
                <option value="editor">Editör</option>
                <option value="admin">Yönetici</option>
              </select>
            </div>

            <div>
              <label htmlFor="status" className="label">
                Durum
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input"
              >
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
              </select>
            </div>
          </div>

          {createUserMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {t('user.create_error')}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
            <Link
              to="/users"
              className="btn-secondary"
            >
              {t('user.cancel')}
            </Link>
            <button
              type="submit"
              className="btn-primary"
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? t('user.creating') : t('user.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
