# Galeriler

Galeriler sıralı tenant medyasını, bir veya daha fazla content kaydına bağlanabilen editoryal birimlerde toplar. Slideshow, proje portföyü, etkinlik albümü ve tekrar kullanılabilir görsel dizileri için kullanın.

## Veri modeli

Gallery; title, opsiyonel description, `draft` veya `published` status, bağlı content ID'leri ve sıralı item'lar içerir. Her item bir media ID'sine referans verir ve kendi title/caption değerini ekleyebilir. Gallery okumaları yalnız aynı tenant'a ait medyayı iliştirir.

```text
GET    https://api.ctxhub.net/api/galleries
GET    https://api.ctxhub.net/api/galleries/:id
POST   https://api.ctxhub.net/api/galleries
PUT    https://api.ctxhub.net/api/galleries/:id
DELETE https://api.ctxhub.net/api/galleries/:id
PUT    https://api.ctxhub.net/api/contents/:id/galleries
```

Liste istekleri search, `contentId`, page ve 100'e kadar limit destekler. Editor'lar gallery oluşturup güncelleyebilir. Gallery silinmeden önce `draft` durumuna alınmalıdır; published gallery silme isteği `409 GALLERY_MUST_BE_DRAFT` döndürür.

## Sunum pratiği

- Medyayı yeniden sıralamak yerine açık item order değerini koruyun.
- Item caption ile media alt text'i birlikte kullanın; farklı amaçlara hizmet ederler.
- Referans verilen bir medyanın erişilemez olabileceğini varsayıp görsel fallback sağlayın.
- Published gallery okumalarını kısa süre cache'leyin; değişiklikte gallery ve bağlı content cache key'lerini temizleyin.
- Media ID'lerini tenant'lar arasında kullanmayın.

Upload, variant ve accessibility metadata için [Medya](./media.md) sayfasına bakın.
