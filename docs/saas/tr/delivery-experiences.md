# Menüler, formlar ve placements

ContextHub Cloud; Content, Collections ve Medya'nın yanında yönetilen sunum kaynakları sağlar.

## Menüler

Menüler navigasyon ağaçlarını sayfa template'lerinden bağımsız modellemeyi sağlar. Menüyü kararlı slug veya tanımlı location ile getirin:

```text
GET https://api.ctxhub.net/api/public/menus/slug/main
X-Tenant-ID: your-tenant-id
```

Item sıralamasını ve hiyerarşiyi koruyun. Harici URL'leri render etmeden doğrulayın.

## Formlar

Formlar label, validation, field type, onay metni ve submission davranışını tanımlar. Public formu yükleyin:

```text
GET https://api.ctxhub.net/api/public/forms/contact
X-Tenant-ID: your-tenant-id
```

Form submission `/public/forms` altında olmasına rağmen write-scope API token ister. Submission'ı güvenilir backend üzerinden proxy edin, bot koruması uygulayın ve validation hatalarını yapılandırılmış şekilde gösterin.

## Placements

Placements hedefli popup, banner, inline deneyim veya özel görünüm seçer. Uygulama context'i yönetilen decision endpoint'ine gönderir ve uygun deneyimi render eder.

```js
const response = await fetch('https://api.ctxhub.net/api/public/placements/decide', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placement: 'homepage-announcement',
    context: { path: '/', sessionId: crypto.randomUUID(), locale: 'tr' },
  }),
})
```

Sayfa birden fazla placement decision istiyorsa batch endpoint kullanın. Analytics'i async kaydedin ve frequency cap kurallarına uyun.

## Sunum kuralları

- Public okumalar da tenant kimliği ve tanımlı CORS origin ister.
- Public cevaplar yalnızca published ve sanitize edilmiş veri içermelidir.
- Kararlı definition'ları kısa süre cache'leyip webhook ile yenileyin.
- Kişiselleştirilmiş placement sonuçlarını global cache'te paylaşmayın.
- Render edilen HTML ve harici URL'leri güvenilmeyen sunum girdisi kabul edin.
