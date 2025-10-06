import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { usersAPI } from '../../lib/api.js'

export default function UserEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
    status: 'active',
    password: ''
  })
  
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [changePassword, setChangePassword] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersAPI.getUser(id).then(res => res.data),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data) => {
      // Only include password if it's being changed
      const updateData = { ...data }
      if (!changePassword) {
        delete updateData.password
      }
      return usersAPI.updateUser(id, updateData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user', id] })
      navigate('/users')
    },
    onError: (error) => {
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors)
      }
    },
  })

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'user',
        status: user.status || 'active',
        password: ''
      })
    }
  }, [user])

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    updateMutation.mutate(formData)
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center">
        <p className="text-gray-500">User not found</p>
        <Link to="/users" className="btn-primary mt-4">
          {t('user.back_to_users')}
        </Link>
      </div>
    )
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
          <h1 className="text-2xl font-bold text-gray-900">{t('user.edit_title')}</h1>
          <p className="mt-2 text-sm text-gray-700">
            {t('user.edit_description')}
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
              <div className="flex items-center gap-3">
                <label htmlFor="changePassword" className="label mb-0">
                  {t('user.change_password')}
                </label>
                <input
                  type="checkbox"
                  id="changePassword"
                  checked={changePassword}
                  onChange={(e) => {
                    setChangePassword(e.target.checked)
                    if (!e.target.checked) {
                      setFormData(prev => ({ ...prev, password: '' }))
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              
              {changePassword && (
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={formData.password || ''}
                    onChange={handleChange}
                    className={`input-with-icon ${errors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    placeholder={t('user.new_password')}
                    required={changePassword}
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
              )}
              
              {changePassword && errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
              {changePassword && (
                <p className="mt-1 text-sm text-gray-500">
                  {t('user.password_hint')}
                </p>
              )}
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
                disabled={updateMutation.isPending}
                className="btn-primary"
              >
                {updateMutation.isPending ? t('user.updating') : t('user.update')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
