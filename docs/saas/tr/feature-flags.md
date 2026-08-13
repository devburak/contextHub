# Feature flags

ContextHub adlandırılmış feature definition ve tenant-specific runtime değerlerini destekler. Content modellerini kopyalamadan uygulama davranışını tenant bazında kademeli açmak için kullanın.

## Tanımlama ve etkinleştirme

Admin'ler definition listeleyip oluşturabilir:

```text
GET  https://api.ctxhub.net/api/feature-flags
POST https://api.ctxhub.net/api/feature-flags
```

Definition; unique key, label, description, default durum ve notlar içerir. Definition'lar ortak katalogdur; tenant-specific değerler ayrı saklanır. Mevcut definition API update veya delete işlemi sunmadığı için kalıcı key'ler seçin.

Tenant değerleri aşağıdaki route'larla dönen ve güncellenen `features` map'inde yaşar:

```text
GET https://api.ctxhub.net/api/tenant-settings
PUT https://api.ctxhub.net/api/tenant-settings
```

Okuma tenant settings view/manage, değiştirme manage izni ister. Eksik değerleri definition default'una göre yorumlayın ve rollout kararlarını tenant sınırında tutun.

## Placement flag'leri açık context'tir

Placement kuralları feature flag adlarını zorunlu tutabilir veya hariç bırakabilir; ancak public decision endpoint tenant settings'i otomatik yüklemez. Çağıran taraf ilgili değerleri `context.featureFlags` içinde göndermelidir.

```json
{
  "placement": "homepage-hero",
  "context": {
    "path": "/",
    "sessionId": "session-8e5d",
    "featureFlags": ["new-home"]
  }
}
```

Feature flag deployment kontrolüdür, permission değildir. UI bir flag ile gizlense bile hassas işlemleri [rol ve izinlerle](./roles-permissions.md) koruyun.
