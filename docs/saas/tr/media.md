# Medya

Medya; yüklenen görsel ve dosyaları, üretilen görsel varyantlarını, erişilebilirlik metnini, etiketleri ve harici video kayıtlarını yönetir. Yeniden kullanılabilir asset'leri, bu asset'lere ID ile referans veren Content ve Collection kayıtlarından ayırır.

## Medya alanları

| Alan | Amaç |
| --- | --- |
| `sourceType` | `upload` veya `external` |
| `url` | Ana sunum URL'i |
| `variants` | URL, genişlik, yükseklik, format ve byte boyutu içeren isimli görsel varyantları |
| `mimeType`, `size` | Dosya tipi ve boyutu |
| `width`, `height` | Görselin doğal ölçüleri |
| `altText` | Anlamlı görseller için erişilebilirlik açıklaması |
| `caption`, `description` | Editoryal sunum metadata'sı |
| `tags` | Asset düzenleme ve filtreleme |
| `status`, `isPublic` | Asset yaşam döngüsü ve sunum amacı |
| `provider`, `providerId`, `externalUrl` | Harici video/provider metadata'sı |

## Upload akışı

Upload güvenilir sunucu veya admin işlemidir. Author veya üstü rol taşıyan write-scope token kullanın.

1. Presigned upload URL isteyin.
2. Dosya byte'larını dönen URL'e yükleyin.
3. Dönen `key` ile medya kaydını tamamlayın.

```js
const presign = await fetch('https://api.ctxhub.net/api/media/presign', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fileName: 'team-photo.jpg',
    contentType: 'image/jpeg',
    size: file.size,
  }),
}).then((response) => response.json())

await fetch(presign.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,
})

const { media } = await fetch('https://api.ctxhub.net/api/media', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    key: presign.key,
    originalName: 'team-photo.jpg',
    mimeType: 'image/jpeg',
    size: file.size,
    altText: 'ContextHub ekibi İstanbul ofisinde',
    tags: ['team'],
  }),
}).then((response) => response.json())
```

API token'ı tarayıcıya göndermeyin. Browser upload gerekiyorsa backend'iniz kullanıcıyı doğrulayıp presigned URL'i istemelidir.

## Görsel varyantı seçin

Layout'a uygun isimli varyantı; sonra `large`, `medium`, ilk varyant ve son olarak root URL'i tercih edin.

```js
function pickMediaUrl(media, preferred = 'large') {
  const variants = media?.variants || []
  return variants.find((item) => item.name === preferred)?.url
    || variants.find((item) => item.name === 'large')?.url
    || variants.find((item) => item.name === 'medium')?.url
    || variants[0]?.url
    || media?.url
}
```

Layout shift'i önlemek için width/height belirtin ve `altText` değerini koruyun.

## Harici medya

YouTube, Vimeo veya desteklenen başka bir URL'i `POST https://api.ctxhub.net/api/media/external` ile kaydedin. Provider metadata'sı ve thumbnail tutun; yalnızca onaylı provider'ları kısıtlayıcı CSP ile embed edin.
