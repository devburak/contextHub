const FEATURE_FLAGS = [
  {
    key: 'contentScheduling',
    label: 'İçerik Zamanlama',
    defaultEnabled: false,
    description: 'İçeriklerin “Zamanlanmış” statüsüne alınmasına ve belirlenen tarihte otomatik yayına hazır hale gelmesine izin verir.',
    notes: 'Tenant Ayarları → Özellik Bayrakları panelinden aç/kapat. Backend create/update uçları bu bayrağa göre planlamayı sınırlar.'
  },
  {
    key: 'galleries',
    label: 'Galeri Yönetimi',
    defaultEnabled: true,
    description: 'Medya öğelerini galeriler halinde gruplayıp içeriklerle ilişkilendirme özelliğini aktif eder.',
    notes: 'Galeri yönetim sayfası ve içerikte galeri paneli bu bayrağa bağlıdır.'
  }
]

export default function Documentation() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Belgeler</h1>
        <p className="text-sm text-gray-600">
          Tenant ayarları, özellik bayrakları ve ilgili API’lere dair özet bilgiler. Bayraklar aşağıda ön tanımlı olarak listelenmiştir; her tenant dilediği bayrakları Tenant Ayarları ekranından aktifleştirip pasifleştirebilir.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Ön Tanımlı Özellik Bayrakları</h2>
          <p className="mt-1 text-sm text-gray-600">
            Aşağıdaki bayraklar platform tarafından desteklenir. Varsayılan durumu burada görebilirsiniz; gerçek kullanımda tenant ayarları geçerlidir.
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
              {FEATURE_FLAGS.map((flag) => (
                <tr key={flag.key}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-900">{flag.key}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{flag.label}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{flag.defaultEnabled ? 'Açık' : 'Kapalı'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{flag.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{flag.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
