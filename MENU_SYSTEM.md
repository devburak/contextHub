# Menu Sistemi - Dokümantasyon

## 🎯 Genel Bakış

WordPress benzeri iç içe geçebilen menu sistemi. Tenant bazlı, sürükle-bırak destekli, esnek menu yönetimi.

## ✅ Tamamlanan Özellikler

### 1. Placement Sayfaları Türkçeleştirildi ✅
- **PlacementsList.jsx** - Tüm metinler Türkçe
- **PlacementEdit.jsx** - Tüm metinler Türkçe  
- **PlacementAnalytics.jsx** - Tüm metinler Türkçe
- i18n bağımlılığı kaldırıldı, doğrudan Türkçe metinler kullanılıyor

**Türkçe Terimler:**
- Placements → Yerleşimler
- Active → Aktif
- Draft → Taslak
- Paused → Duraklatıldı
- Archived → Arşivlendi
- Impressions → Gösterimler
- Views → Görüntülenmeler
- Clicks → Tıklamalar
- Conversions → Dönüşümler
- Experiences → Deneyimler

### 2. Menu Sistemi Backend ✅

#### MongoDB Model (Menu.js)
```javascript
// Özellikler:
- Birden fazla menu oluşturma
- İç içe menu items (parent-child)
- Custom URL veya internal link
- Drag & drop sıralama
- Tenant bazlı
- Max depth kontrolü (varsayılan: 3)
```

**Menu Schema:**
```javascript
{
  name: String,              // "Ana Menü"
  slug: String,              // "ana-menu"
  description: String,       // Açıklama
  location: String,          // header, footer, sidebar, mobile, custom
  items: [MenuItem],         // Menu öğeleri
  status: String,            // active, draft, archived
  tenantId: ObjectId,
  meta: {
    totalItems: Number,
    maxDepth: Number,
    lastModifiedBy: ObjectId
  }
}
```

**MenuItem Schema:**
```javascript
{
  title: String,             // "Ana Sayfa"
  type: String,              // custom, page, category, content, form, external
  url: String,               // "/about" veya "https://..."
  reference: {               // Internal link için
    model: String,
    id: ObjectId
  },
  target: String,            // _self, _blank
  cssClasses: String,        // "menu-item-home active"
  icon: String,              // Icon class/name
  description: String,       // Tooltip
  parentId: ObjectId,        // Parent item ID
  order: Number,             // Sıralama
  isVisible: Boolean,        // Görünürlük
  children: [ObjectId]       // Alt öğeler
}
```

**Model Methods:**
- `getTree()` - Menüyü ağaç yapısında döner
- `getItem(itemId)` - Belirli bir öğeyi döner
- `addItem(itemData)` - Yeni öğe ekler
- `updateItem(itemId, updates)` - Öğeyi günceller
- `deleteItem(itemId)` - Öğeyi ve alt öğelerini siler (recursive)
- `reorderItems(itemOrders)` - Öğeleri yeniden sıralar
- `getDepth(itemId)` - Menü derinliğini hesaplar
- `validateDepth()` - Max depth kontrolü

#### Menu Service (menuService.js)
**CRUD İşlemleri:**
- `listMenus(tenantId, filters)` - Filtrelenmiş liste
- `getMenu(tenantId, menuId)` - Detay
- `getMenuTree(tenantId, menuId)` - Ağaç yapısı
- `createMenu(tenantId, menuData, userId)` - Yeni menü
- `updateMenu(tenantId, menuId, updates, userId)` - Güncelle
- `deleteMenu(tenantId, menuId)` - Sil
- `duplicateMenu(tenantId, menuId, newName, userId)` - Kopyala

**Menu Item İşlemleri:**
- `addMenuItem(tenantId, menuId, itemData)` - Öğe ekle
- `updateMenuItem(tenantId, menuId, itemId, updates)` - Öğe güncelle
- `deleteMenuItem(tenantId, menuId, itemId)` - Öğe sil (recursive)
- `reorderMenuItems(tenantId, menuId, itemOrders)` - Yeniden sırala
- `moveMenuItem(tenantId, menuId, itemId, newParentId, newOrder)` - Öğeyi taşı

**Public Methods:**
- `getMenuByLocation(tenantId, location)` - Konuma göre aktif menü
- `getMenuBySlug(tenantId, slug)` - Slug'a göre aktif menü

#### API Routes (routes/menus.js)

**Admin Endpoints:**
```
GET    /api/menus                      - Menüleri listele
GET    /api/menus/:id                  - Menü detayı
GET    /api/menus/:id/tree             - Menü ağaç yapısı
POST   /api/menus                      - Yeni menü
PUT    /api/menus/:id                  - Menü güncelle
DELETE /api/menus/:id                  - Menü sil
POST   /api/menus/:id/duplicate        - Menü kopyala

POST   /api/menus/:id/items            - Öğe ekle
PUT    /api/menus/:id/items/:itemId    - Öğe güncelle
DELETE /api/menus/:id/items/:itemId    - Öğe sil
POST   /api/menus/:id/reorder          - Öğeleri yeniden sırala
POST   /api/menus/:id/items/:itemId/move - Öğeyi taşı

GET    /api/menus/stats                - İstatistikler
```

**Public Endpoints:**
```
GET    /api/public/menus/location/:location - Konuma göre menü
GET    /api/public/menus/slug/:slug         - Slug'a göre menü
```

### 3. Menu Admin UI ✅

#### MenuList.jsx
**Özellikler:**
- Menülerin listesi (tablo görünümü)
- Arama (isim ve slug'da)
- Filtreleme (konum, durum)
- CRUD işlemleri (Düzenle, Kopyala, Sil)
- Görsel göstergeler:
  - Durum badge'leri (Aktif, Taslak, Arşivlendi)
  - Konum badge'leri (Üst Menü, Alt Menü, Yan Menü, Mobil Menü, Özel)
  - Öğe sayısı gösterimi

#### MenuEdit.jsx
**Özellikler:**
- 2 kolonlu layout:
  - Sol: Temel bilgiler (isim, slug, konum, durum, açıklama)
  - Sağ: Menu öğeleri
- Menu öğeleri:
  - İç içe görünüm (indentation ile)
  - Drag & drop hazır (GripVertical icon)
  - Öğe ekleme/düzenleme modal formu
  - Öğe silme (recursive)
  - Görünürlük kontrolü
  
**Menu Item Form:**
- Başlık *
- Tip (custom, external, page, category, content, form)
- URL (custom/external için)
- Hedef (_self, _blank)
- CSS Sınıfları
- Açıklama (tooltip)
- Görünür checkbox

**Validasyonlar:**
- Slug unique kontrolü
- Parent-child döngü önleme
- Max depth kontrolü
- Yeni menüde "önce kaydet" uyarısı

### 4. Navigation Entegrasyonu ✅

**Layout.jsx:**
- `Bars3BottomLeftIcon` eklendi
- "Menüler" menu öğesi eklendi (Placements ile Varlıklar arasında)

**App.jsx:**
- Menu sayfaları import edildi
- 2 route eklendi:
  - `/menus` → MenuList
  - `/menus/:id` → MenuEdit

## 🎨 Menu Konumları

```javascript
const locations = {
  header: 'Üst Menü',        // Site üst menüsü
  footer: 'Alt Menü',        // Site alt menüsü
  sidebar: 'Yan Menü',       // Sidebar menüsü
  mobile: 'Mobil Menü',      // Mobil hamburger menü
  custom: 'Özel'             // Özel kullanım
};
```

## 🔗 Menu Item Tipleri

```javascript
const types = {
  custom: 'Özel URL',        // Internal path: /about
  external: 'Harici Link',   // External URL: https://example.com
  page: 'Sayfa',             // Page reference
  category: 'Kategori',      // Category reference
  content: 'İçerik',         // Content reference
  form: 'Form'               // Form reference
};
```

## 📊 Kullanım Örnekleri

### Frontend'de Menu Kullanımı

```javascript
// Public API'den menu çekme
const response = await fetch('/api/public/menus/location/header', {
  headers: {
    'X-Tenant-ID': 'tenant-id'
  }
});

const { tree } = await response.json();

// tree: Ağaç yapısında menu
[
  {
    title: 'Ana Sayfa',
    url: '/',
    children: []
  },
  {
    title: 'Ürünler',
    url: '/products',
    children: [
      {
        title: 'Kategori 1',
        url: '/products/category-1',
        children: []
      }
    ]
  }
]
```

### React Component Örneği

```jsx
function Navigation({ menuSlug }) {
  const [menu, setMenu] = useState(null);
  
  useEffect(() => {
    fetch(`/api/public/menus/slug/${menuSlug}`, {
      headers: { 'X-Tenant-ID': tenantId }
    })
    .then(res => res.json())
    .then(data => setMenu(data.tree));
  }, [menuSlug]);
  
  const renderMenu = (items) => (
    <ul>
      {items.map(item => (
        <li key={item._id} className={item.cssClasses}>
          <a 
            href={item.url} 
            target={item.target}
            title={item.description}
          >
            {item.title}
          </a>
          {item.children?.length > 0 && renderMenu(item.children)}
        </li>
      ))}
    </ul>
  );
  
  return menu ? renderMenu(menu) : <div>Loading...</div>;
}
```

## 🚀 Test Senaryoları

### Admin UI Test
1. **Menü Oluşturma:**
   - `/menus` sayfasına git
   - "Yeni Menü" butonuna tıkla
   - İsim: "Ana Menü", Konum: "Üst Menü"
   - Kaydet

2. **Menü Öğesi Ekleme:**
   - Oluşturulan menüyü düzenle
   - "Öğe Ekle" butonuna tıkla
   - Başlık: "Ana Sayfa", URL: "/", Kaydet
   - "Öğe Ekle" → Başlık: "Hakkımızda", URL: "/about", Kaydet

3. **Alt Menü Ekleme:**
   - "Ürünler" ana öğesi ekle
   - "Ürünler" öğesini düzenle, parentId olarak "Ürünler"ün ID'sini seç
   - Birkaç alt öğe ekle

4. **Sıralama ve Silme:**
   - Öğeleri sürükle-bırak ile yeniden sırala (gelecek özellik)
   - Bir öğeyi sil, alt öğelerinin de silindiğini doğrula

### API Test

```bash
# Menü oluştur
curl -X POST http://localhost:3000/api/menus \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: test" \
  -d '{
    "name": "Ana Menü",
    "slug": "ana-menu",
    "location": "header",
    "status": "active"
  }'

# Menü öğesi ekle
curl -X POST http://localhost:3000/api/menus/{menuId}/items \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: test" \
  -d '{
    "title": "Ana Sayfa",
    "type": "custom",
    "url": "/",
    "target": "_self",
    "isVisible": true
  }'

# Public endpoint'ten menü çek
curl -X GET "http://localhost:3000/api/public/menus/location/header" \
  -H "X-Tenant-ID: test"
```

## 🔧 Gelecek Geliştirmeler

### Öncelikli:
- [ ] @dnd-kit ile drag & drop sıralama
- [ ] Bulk operations (toplu durum değiştirme)
- [ ] Menu export/import (JSON)
- [ ] Menu item icons (icon picker)
- [ ] Menu item conditional visibility (role-based)

### İsteğe Bağlı:
- [ ] Menu templates (starter menus)
- [ ] Menu preview (frontend preview)
- [ ] Menu versioning (history)
- [ ] Menu item badges (new, hot, etc.)
- [ ] Mega menu support
- [ ] Menu analytics (click tracking)

## 📚 Dosya Yapısı

```
contextHub/
├── packages/common/src/models/
│   └── Menu.js                    ✅ WordPress benzeri model
├── apps/api/src/
│   ├── services/
│   │   └── menuService.js         ✅ CRUD + item management
│   └── routes/
│       └── menus.js               ✅ 15 endpoint
└── apps/admin/src/
    ├── components/
    │   └── Layout.jsx             ✅ Navigation öğesi eklendi
    ├── pages/menus/
    │   ├── MenuList.jsx           ✅ Liste sayfası
    │   ├── MenuEdit.jsx           ✅ Düzenleme sayfası
    │   └── index.js               ✅ Export
    └── App.jsx                    ✅ Routes eklendi
```

## 🎉 Özet

**Tamamlanan:**
1. ✅ Placement sayfaları Türkçeleştirildi
2. ✅ Menu MongoDB modeli (WordPress benzeri)
3. ✅ Menu backend service (15+ method)
4. ✅ Menu API routes (15 endpoint)
5. ✅ Menu Admin UI (Liste + Düzenleme)
6. ✅ Navigation entegrasyonu

**Sistem Durumu:** Tam çalışır durumda! 🚀

**Test İçin:**
1. API server'ı başlat: `pnpm run dev:api`
2. Admin UI'ı başlat: `pnpm dev` (admin klasöründe)
3. `/menus` sayfasına git
4. Menü oluştur ve test et!
