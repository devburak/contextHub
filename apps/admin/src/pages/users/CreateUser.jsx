import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { userAPI } from '../../lib/userAPI.js'

export default function CreateUser() {
  const navigate = useNavigate()
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
    onSuccess: () => {
      navigate('/users')
    },
    onError: (error) => {
      console.error('Kullanıcı oluşturma hatası:', error.response?.data?.message || error.message)
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Yeni Kullanıcı Oluştur
          </h2>
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
                className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                value={formData.firstName}
                onChange={handleChange}
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
                className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                value={formData.lastName}
                onChange={handleChange}
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
                className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                value={formData.email}
                onChange={handleChange}
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
                className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                value={formData.username}
                onChange={handleChange}
              />
            </div>

            {/* Password */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Şifre
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  id="password"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-10 shadow-sm sm:text-sm border-gray-300 rounded-md"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 z-10"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-500 hover:text-gray-700 transition-colors" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-500 hover:text-gray-700 transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Rol
              </label>
              <select
                id="role"
                name="role"
                className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="viewer">Görüntüleyici</option>
                <option value="editor">Editör</option>
                <option value="admin">Yönetici</option>
              </select>
            </div>

            {/* Status */}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Durum
              </label>
              <select
                id="status"
                name="status"
                className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={createUserMutation.isPending}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {createUserMutation.isPending ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
          </button>
        </div>

        {createUserMutation.isError && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">
              Kullanıcı oluşturulurken hata oluştu. Lütfen tekrar deneyin.
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
