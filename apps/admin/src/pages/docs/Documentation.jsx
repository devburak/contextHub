import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { featureFlagsAPI } from '../../lib/featureFlagsAPI.js'

export default function Documentation() {
  const queryClient = useQueryClient()
  const flagsQuery = useQuery({
    queryKey: ['feature-flags'],
    queryFn: featureFlagsAPI.list
  })

  const [formState, setFormState] = useState({
    key: '',
    label: '',
    description: '',
    notes: '',
    defaultEnabled: false
  })
  const [formError, setFormError] = useState('')

  const createMutation = useMutation({
    mutationFn: featureFlagsAPI.create,
    onMutate: () => setFormError(''),
    onSuccess: () => {
      setFormState({ key: '', label: '', description: '', notes: '', defaultEnabled: false })
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Özellik oluşturulamadı.'
      setFormError(message)
    }
  })

  const flagRows = useMemo(() => flagsQuery.data ?? [], [flagsQuery.data])

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormState((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!formState.key.trim() || !formState.label.trim()) {
      setFormError('Anahtar ve başlık alanları zorunludur.')
      return
    }
    createMutation.mutate({
      key: formState.key.trim(),
      label: formState.label.trim(),
      description: formState.description.trim(),
      notes: formState.notes.trim(),
      defaultEnabled: formState.defaultEnabled
    })
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Belgeler</h1>
        <p className="text-sm text-gray-600">
          Tenant ayarları ve özellik bayraklarının uygulamada nasıl kullanıldığına dair rehber. Buradan yeni özellik bayrakları tanımlayabilir ve mevcutları görüntüleyebilirsin.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Özellik Bayrakları</h2>
          <p className="mt-1 text-sm text-gray-600">
            Aşağıda sistemde tanımlı bayrakların listesi ve varsayılan davranışları yer alır. Tenant bazlı etkinleştirme Tenant Ayarları ekranından yapılır.
          </p>
        </div>
        <div className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Anahtar</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Başlık</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Varsayılan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Açıklama</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Notlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {flagsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500">Özellik bayrakları yükleniyor...</td>
                </tr>
              ) : flagRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500">Henüz tanımlı bir özellik bulunmuyor.</td>
                </tr>
              ) : (
                flagRows.map((flag) => (
                  <tr key={flag.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-900">{flag.key}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{flag.label}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{flag.defaultEnabled ? 'Açık' : 'Kapalı'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{flag.description || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{flag.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Yeni Özellik Bayrağı Ekle</h2>
          <p className="mt-1 text-sm text-gray-600">
            Yeni bir özellik tanımladığında anahtarın benzersiz olmasına dikkat et. Tanımladığın bayrağı tenant ayarlarında kullanarak etkinleştirebilirsin.
          </p>
        </div>
        <form className="space-y-4 px-6 py-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="flag-key">Anahtar</label>
              <input
                id="flag-key"
                name="key"
                type="text"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={formState.key}
                onChange={handleChange}
                placeholder="örn. contentScheduling"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="flag-label">Başlık</label>
              <input
                id="flag-label"
                name="label"
                type="text"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={formState.label}
                onChange={handleChange}
                placeholder="örn. İçerik Zamanlama"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="flag-description">Açıklama</label>
              <textarea
                id="flag-description"
                name="description"
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={formState.description}
                onChange={handleChange}
                placeholder="Bu bayrak hangi davranışı kontrol ediyor?"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="flag-notes">Notlar</label>
              <textarea
                id="flag-notes"
                name="notes"
                rows={2}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                value={formState.notes}
                onChange={handleChange}
                placeholder="İç süreç yönergeleri, rollout planı vb."
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="flag-default"
                name="defaultEnabled"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={formState.defaultEnabled}
                onChange={handleChange}
              />
              <label htmlFor="flag-default" className="text-sm text-gray-700">Varsayılan olarak açık olsun</label>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={createMutation.isLoading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
            >
              {createMutation.isLoading ? 'Kaydediliyor...' : 'Özellik Ekle'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Tenant Ayarları API Kullanımı</h2>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm text-gray-700">
          <p>
            Tenant başına ayarlar <code className="rounded bg-gray-100 px-1 py-0.5">GET /api/tenant-settings</code> ile okunur ve
            <code className="rounded bg-gray-100 px-1 py-0.5">PUT /api/tenant-settings</code> ile güncellenir. Uçlar owner/admin rolleri tarafından erişilebilir ve hassas alanlar (ör. SMTP parolası) varsayılan olarak maskelenir.
          </p>
          <p>
            Admin panelindeki Tenant Ayarları sayfası ayarları düzenler. Servis katmanında <code className="rounded bg-gray-100 px-1 py-0.5">tenantSettingsService.getSettings()</code>
            fonksiyonu varsayılanlarla birleştirilmiş sonucu döner; <code className="rounded bg-gray-100 px-1 py-0.5">features</code> alanı tenant bazlı özellik bayraklarını içerir.
          </p>
          <p>
            Örnek kullanım: içerik servisinde <code className="rounded bg-gray-100 px-1 py-0.5">featureFlags.contentScheduling</code> kontrol edilerek “scheduled” durumuna izin verilir ya da engellenir.
          </p>
        </div>
      </section>
    </div>
  )
}
