# Roller ve izinler

ContextHub Cloud erişimi tenant membership sınırında uygular. Bir kullanıcı birden fazla tenant'a üye olup her birinde farklı role sahip olabilir. Böylece ajans admin kalırken müşteri ekibine editoryal erişim verilebilir.

## Sistem rolleri

Yerleşik hiyerarşi `Viewer`, `Author`, `Editor`, `Admin` ve `Owner` rollerinden oluşur. Sistem rolleri düzenlenemez veya silinemez. İzinler `content:view`, `content:update`, `placements:manage` ve `analytics:view` gibi resource/action ifadeleridir.

Yetkiyi yalnız rol adından çıkarmayın. Özellikle custom rol ve entegrasyonlarda role dönen permission listesini okuyun.

## Özel roller

`roles:manage` izni olan kullanıcılar, isterlerse bir sistem rolünü başlangıç alarak tenant-scoped rol oluşturabilir:

```http
POST https://api.ctxhub.net/api/roles
Authorization: Bearer <admin-session-token>
Content-Type: application/json

{
  "name": "Client editor",
  "description": "Kullanıcı veya ayar yönetmeden içerik düzenler",
  "baseRoleKey": "editor",
  "permissions": ["content:view", "content:create", "content:update"]
}
```

```text
GET    /api/roles
POST   /api/roles
PUT    /api/roles/:id
DELETE /api/roles/:id
PUT    /api/users/:id/role
```

Custom role key'leri sistem rol key'lerinin yerini alamaz. Bir membership'e atanmış custom rol silinemez. Owner rolünü yalnız mevcut owner verebilir; owner güvenlik kontrolleri tenant'ın son owner'ının kaldırılmasını engeller.

## Ajans modeli

1. Kurtarma için kontrolünüzde en az iki owner hesabı tutun.
2. Ajans operatörlerine `Admin` veya dar kapsamlı custom rol verin.
3. Müşteri editörlerine yalnız ihtiyaç duydukları content, media, collection, form, menu veya placement işlemlerini verin.
4. Rol, kullanıcı, token, tenant settings ve extension yönetimini küçük bir grupla sınırlayın.
5. Membership ve [activity kayıtlarını](./audit-activity.md) düzenli inceleyin.

API token'larının da rolü vardır; ancak etkin erişim ayrıca token scope'larıyla daraltılır. [API token yaşam döngüsüne](./api-token-lifecycle.md) bakın.
