import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'

const initialFormState = {
  name: '',
  slug: '',
  plan: 'free'
}

const plans = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' }
]

export default function CreateTenant() {
  const [formData, setFormData] = useState(initialFormState)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { addMembership } = useAuth()

  const createMutation = useMutation({
    mutationFn: tenantAPI.createTenant,
    onMutate: () => {
      setError('')
      setSuccessMessage('')
    },
    onSuccess: ({ tenant, membership, token }) => {
      const newMembership = {
        id: membership.id,
        tenantId: tenant.id,
        tenant,
        role: membership.role,
        status: membership.status,
        token
      }

      addMembership(newMembership, { activate: true })
      setSuccessMessage(`${tenant.name} varlığı başarıyla oluşturuldu.`)
      setFormData(initialFormState)
      queryClient.invalidateQueries({ queryKey: ['tenants', 'list'] })

      setTimeout(() => {
        navigate('/varliklar')
      }, 1200)
    },
    onError: (err) => {
      setError(err.response?.data?.message || err.response?.data?.error || 'Varlık oluşturulamadı')
    }
  })

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'name') {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      }
      return next
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      setError('Varlık adı gereklidir')
      return
    }

    createMutation.mutate({
      name: formData.name.trim(),
      slug: formData.slug.trim() || undefined,
      plan: formData.plan
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Yeni Varlık Oluştur</h1>
        <p className="mt-2 text-sm text-gray-600">
          Yeni veriler saklamak için bir varlık oluştur. Oluşturduğun varlık için otomatik olarak owner rolüne sahip olursun.
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Varlık Adı
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              value={formData.slug}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="ör. firma-adi"
            />
            <p className="mt-1 text-xs text-gray-500">Slug alanını boş bırakırsan isimden otomatik üretilecektir.</p>
          </div>

          <div>
            <label htmlFor="plan" className="block text-sm font-medium text-gray-700">
              Plan
            </label>
            <select
              id="plan"
              name="plan"
              value={formData.plan}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {plans.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {successMessage && <div className="text-sm text-green-600">{successMessage}</div>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
            >
              {createMutation.isPending ? 'Oluşturuluyor...' : 'Varlık Oluştur'}
            </button>
            <Link
              to="/varliklar"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Geri dön
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
