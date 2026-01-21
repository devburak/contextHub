import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { userAPI } from '../../lib/userAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { roleAPI } from '../../lib/roleAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'

// Utility function to mask personal data (KVKK/GDPR compliant)
const maskPersonalData = (text) => {
  if (!text || text.length === 0) return '*****'
  return text.charAt(0) + '*****'
}

export default function CreateUser() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  const { role: currentUserRole } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  
  // Wizard state
  const [step, setStep] = useState(1) // 1: Email girişi, 2: Form (yeni/mevcut kullanıcı)
  const [userExists, setUserExists] = useState(false)
  const [existingUser, setExistingUser] = useState(null)
  const [email, setEmail] = useState('')
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    role: 'viewer',
    status: 'active'
  })

  const { data: rolesResponse, isLoading: rolesLoading, error: rolesError } = useQuery({
    queryKey: ['roles'],
    queryFn: roleAPI.getRoles,
  })

  // Email kontrol mutation
  const checkEmailMutation = useMutation({
    mutationFn: userAPI.checkEmail,
    onSuccess: (data) => {
      if (data.exists) {
        setUserExists(true)
        setExistingUser(data.user)
        setFormData(prev => ({
          ...prev,
          email: email,
          firstName: maskPersonalData(data.user.firstName), // Mask first name (KVKK/GDPR)
          lastName: maskPersonalData(data.user.lastName) // Mask last name (KVKK/GDPR)
        }))
        toast.info(t('user.wizard.user_exists'))
      } else {
        setUserExists(false)
        setExistingUser(null)
        setFormData(prev => ({
          ...prev,
          email: email,
          firstName: '',
          lastName: '',
          username: '',
          password: ''
        }))
        toast.info(t('user.wizard.user_not_found'))
      }
      setStep(2)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('user.create_error'))
    }
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
      .filter((role) => {
        if (!role.key) return false
        // Owner rolünü sadece mevcut kullanıcı owner ise göster
        if (role.key === 'owner' && currentUserRole !== 'owner') return false
        return true
      })
  }, [rolesResponse, currentUserRole])

  useEffect(() => {
    if (availableRoles.length === 0) {
      return
    }

    setFormData((prev) => {
      if (prev.role && availableRoles.some((role) => role.key === prev.role)) {
        return prev
      }

      return {
        ...prev,
        role: availableRoles[0]?.key || prev.role,
      }
    })
  }, [availableRoles])

  const createUserMutation = useMutation({
    mutationFn: (data) => {
      // Mevcut kullanıcı ise invite endpoint'ini kullan
      if (userExists) {
        console.log('[CreateUser] Inviting existing user:', { email: data.email, role: data.role })
        return userAPI.inviteUser({
          email: data.email,
          role: data.role
        })
      }
      // Yeni kullanıcı ise create endpoint'ini kullan
      console.log('[CreateUser] Creating new user:', data)
      return userAPI.createUser(data)
    },
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

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    if (!email || !email.trim()) {
      toast.error(t('user.email_required'))
      return
    }
    checkEmailMutation.mutate(email)
  }

  const handleBackToEmail = () => {
    setStep(1)
    setUserExists(false)
    setExistingUser(null)
    setEmail('')
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

      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'}`}>
            {step === 1 ? '1' : '✓'}
          </div>
          <span className={`text-sm font-medium ${step === 1 ? 'text-gray-900' : 'text-gray-500'}`}>
            {t('user.wizard.step1_title')}
          </span>
        </div>
        <div className="h-px w-12 bg-gray-300" />
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            2
          </div>
          <span className={`text-sm font-medium ${step === 2 ? 'text-gray-900' : 'text-gray-500'}`}>
            {step === 2 && userExists ? t('user.wizard.step2_existing_title') : t('user.wizard.step2_new_title')}
          </span>
        </div>
      </div>

      <div className="card">
        {step === 1 && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label htmlFor="email-check" className="label">
                {t('user.email')}
              </label>
              <input
                type="email"
                id="email-check"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder={t('user.wizard.email_placeholder')}
                required
                autoFocus
              />
              <p className="mt-1 text-sm text-gray-500">
                {t('user.wizard.email_hint')}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
              <Link to="/users" className="btn-secondary">
                {t('user.cancel')}
              </Link>
              <button
                type="submit"
                className="btn-primary"
                disabled={checkEmailMutation.isPending}
              >
                {checkEmailMutation.isPending ? t('user.wizard.checking') : t('user.wizard.check_email')}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Mevcut kullanıcı bilgisi */}
          {userExists && existingUser && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">
                {t('user.wizard.user_exists')}
              </p>
              <p className="mt-1 text-sm text-blue-700">
                {t('user.wizard.existing_user_info')}
              </p>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label">
                {t('user.wizard.first_name')}
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="input"
                placeholder={t('user.wizard.first_name')}
                required
                disabled={userExists}
              />
            </div>

            <div>
              <label htmlFor="lastName" className="label">
                {t('user.wizard.last_name')}
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="input"
                placeholder={t('user.wizard.last_name')}
                required
                disabled={userExists}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="email" className="label">
                {t('user.email')}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder={t('user.wizard.email_placeholder')}
                required
                disabled
              />
            </div>

            {/* Kullanıcı adı ve şifre sadece yeni kullanıcı için */}
            {!userExists && (
              <>
                <div className="md:col-span-2">
                  <label htmlFor="username" className="label">
                    {t('user.wizard.username')}
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="input"
                    placeholder={t('user.wizard.username')}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    {t('user.wizard.default_password')}
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
                  <p className="mt-1 text-sm text-gray-500">{t('user.wizard.default_password_hint')}</p>
                </div>
              </>
            )}

            <div>
              <label htmlFor="role" className="label">
                {t('user.wizard.role_label')}
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="input"
                disabled={rolesLoading}
              >
                {availableRoles.length > 0 ? (
                  availableRoles.map((role) => (
                    <option key={role.id || role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="viewer">{t('role.viewer')}</option>
                    <option value="editor">{t('role.editor')}</option>
                    <option value="admin">{t('role.admin')}</option>
                  </>
                )}
              </select>
              {rolesError && (
                <p className="mt-1 text-sm text-red-600">
                  {t('user.roles_load_error')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="status" className="label">
                {t('user.wizard.status_label')}
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input"
              >
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
          </div>

          {createUserMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {t('user.create_error')}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={handleBackToEmail}
              className="btn-secondary"
            >
              {t('user.wizard.back')}
            </button>
            <div className="flex gap-3">
              <Link to="/users" className="btn-secondary">
                {t('user.cancel')}
              </Link>
              <button
                type="submit"
                className="btn-primary"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending 
                  ? t('user.creating') 
                  : userExists 
                    ? t('user.wizard.invite_button') 
                    : t('user.wizard.create_button')}
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
