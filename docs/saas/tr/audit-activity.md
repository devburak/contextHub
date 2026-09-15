# Audit log ve activity

ContextHub iki farklı operasyon görünümü sunar. Hesap verilebilir erişim değişiklikleri için kalıcı security activity log'u; son editoryal hareketleri görmek için dashboard activity feed'i kullanın. Bunlar birbirinin yerine geçmez.

## Security activity log

```text
GET https://api.ctxhub.net/api/activities
GET https://api.ctxhub.net/api/activities/recent
```

Tenant-scoped log; desteklenen authentication, session, security, API token, membership ve ilgili işlemleri actor, açıklama, metadata, request IP, user agent ve zaman bilgisiyle kaydeder. `/activities` pagination ile `action` ve `userId` filtreleri; `/activities/recent` daha küçük bir son kayıt görünümü sağlar. Mevcut route'lar authentication ister fakat ayrıca activity-view permission uygulamaz.

Activity log kayıtlarının retention index'i 180 gündür. Politikanız daha uzun saklama istiyorsa güvenlik veya uyumluluk sisteminize export edin. Audit yazma hatasının ana ürün işlemini bozmaması hedeflenir; bu nedenle finansal ledger veya garantili write-ahead log değildir.

Her content düzenlemesi bugün bu security koleksiyonunda yer almaz. Bunu her alan değişikliğinin eksiksiz ve immutable geçmişi olarak sunmayın.

## Dashboard activity feed

`GET /api/dashboard/activities`, mevcut kayıtlardan son content, media ve form hareketlerini türetir. Owner tenant veya self scope isteyebilir; diğer roller kendi hareketleriyle sınırlanır. Dashboard için yararlıdır fakat kalıcı audit trail değildir.

## Operasyon pratiği

- Activity sayfasını veya server proxy'yi uygulamanızdaki gözetim rollerine açın ve dashboard tüketicilerine geniş credential vermeyin.
- Token oluşturma/silme, membership değişiklikleri, tekrarlayan authentication hataları ve owner değişikliklerine alarm kurun.
- Serbest metadata içine hassas değer koymayın.
- Olayları timestamp ve güvenli identifier'larla uygulama ve Edge Gateway log'larıyla ilişkilendirin.
- Mevzuat veya sözleşme gerektiriyorsa retention süresi bitmeden export edin.

Authorization tasarımı için [Roller ve izinlere](./roles-permissions.md) bakın.
