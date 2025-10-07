# Ref Field Autocomplete Özelliği

## 📋 Genel Bakış

Koleksiyonlarda **ref** tipindeki field'lar artık akıllı autocomplete özelliğine sahip! Kullanıcılar ref field'lara veri girerken, hedef koleksiyondan kayıtları arayıp seçebilirler.

## ✨ Özellikler

### 1. **Otomatik Tamamlama**
- Ref field'a tıklandığında hedef koleksiyondan kayıtlar listelenir
- Arama yaparak kayıtları filtreleyebilirsiniz
- Gerçek zamanlı arama sonuçları

### 2. **Akıllı Başlık Gösterimi**
Sistem, entry'lerin başlığını bulmak için şu sırayla arar:
- `data.title`
- `data.name`
- `data.baslik`
- İlk string field
- Entry ID (fallback)

### 3. **Çoklu Seçim Desteği**
- `settings.multiple: true` ise birden fazla entry seçilebilir
- Seçili öğeler tag olarak gösterilir
- Her tag'in yanında kaldır butonu var

### 4. **Seçili Öğelerin Gösterimi**
- Seçili entry'ler mavi tag'ler halinde üstte gösterilir
- Tag'lere tıklayarak seçimi kaldırabilirsiniz
- Dropdown'da seçili öğeler ✓ işareti ile belirtilir

## 🎯 Kullanım

### Koleksiyon Tanımında

```javascript
{
  key: "donem",
  name: "Dönem",
  type: "ref",
  ref: "donem",  // Hedef koleksiyon key'i
  settings: {
    multiple: false  // veya true (çoklu seçim için)
  }
}
```

### Component Kullanımı

```jsx
<RefFieldAutocomplete
  refTarget="donem"              // Hedef koleksiyon key'i
  value={selectedId}             // Tek seçim: string, Çoklu: string[]
  onChange={(newValue) => {...}} // Değer değiştiğinde çağrılır
  multiple={false}               // Çoklu seçim desteği
  placeholder="Aramaya başlayın..."
/>
```

## 🔧 Teknik Detaylar

### API Entegrasyonu

Component, `collectionsApi.listCollectionEntries` kullanarak:
1. **Arama sırasında**: `q` parametresi ile filtrelenmiş kayıtları çeker
2. **Seçili kayıtlar için**: `filter: { _id: { $in: [...] } }` ile detayları çeker

### Performans İyileştirmeleri

- **Lazy Loading**: Dropdown açıldığında kayıtlar çekilir
- **Debouncing**: React Query cache ile gereksiz istekler engellenir
- **Limit**: Her aramada maksimum 20 kayıt getirilir

### State Yönetimi

- Seçili entry'lerin hem ID'leri hem de detayları tutulur
- Dış tıklama ile dropdown otomatik kapanır
- Arama terimi component içinde local state'te tutulur

## 📝 Örnek Senaryolar

### Senaryo 1: Ders - Dönem İlişkisi

```javascript
// Ders koleksiyonu
{
  fields: [
    { key: "ad", type: "string", name: "Ders Adı" },
    { 
      key: "donem", 
      type: "ref", 
      ref: "donem",
      name: "Dönem",
      settings: { multiple: false }
    }
  ]
}

// Kullanıcı "donem" field'ına tıklar
// → Dönem koleksiyonundan kayıtlar listelenir
// → "2024 Bahar" yazarak arama yapabilir
// → İlgili dönemi seçer
// → Seçim otomatik kaydedilir
```

### Senaryo 2: Blog Post - Etiketler

```javascript
// Blog Post koleksiyonu
{
  fields: [
    { key: "baslik", type: "string", name: "Başlık" },
    { 
      key: "etiketler", 
      type: "ref", 
      ref: "etiket",
      name: "Etiketler",
      settings: { multiple: true }  // Çoklu seçim
    }
  ]
}

// Kullanıcı birden fazla etiket seçebilir
// → Seçili etiketler tag'ler halinde gösterilir
// → Her tag ayrı ayrı kaldırılabilir
```

## 🎨 UI/UX Özellikleri

- **Arama ikonu**: Input'un solunda büyüteç ikonu
- **Temizle butonu**: Arama terimi varsa sağda X ikonu
- **Hover efektleri**: Dropdown öğelerinde hover ile renk değişimi
- **Seçili gösterimi**: Mavi arka plan ve ✓ işareti
- **Tag'ler**: Seçili öğeler için mavi rounded tag'ler
- **Açıklama metni**: Input altında hedef koleksiyon bilgisi
- **Boş durum**: Kayıt yoksa "Sonuç bulunamadı" mesajı

## 🐛 Hata Durumları

### Hedef Koleksiyon Tanımsız
```jsx
⚠️ Hedef koleksiyon tanımlanmamış
```
Ref field'da `ref` property'si eksikse gösterilir.

### Kayıt Yok
```
Kayıt bulunamadı
```
Hedef koleksiyonda hiç entry yoksa gösterilir.

### Arama Sonucu Yok
```
Sonuç bulunamadı
```
Arama kriteri ile eşleşen kayıt yoksa gösterilir.

## 🚀 Gelecek İyileştirmeler

- [ ] Sonsuz scroll (infinite scroll) desteği
- [ ] Seçili entry'lerin önizlemesi (tooltip)
- [ ] Klavye navigasyonu (arrow keys)
- [ ] Son seçilenler cache'i
- [ ] Bulk seçim/kaldırma
- [ ] Entry create butonu (hedef koleksiyona hızlı ekleme)

## � İlgili Özellikler

Bu özellik, **Collection Key Autocomplete** özelliği ile birlikte çalışır:

1. **CollectionKeyAutocomplete**: Koleksiyon tanımlarken hedef koleksiyon seçimi (`/docs/COLLECTION-KEY-AUTOCOMPLETE.md`)
2. **RefFieldAutocomplete**: Entry oluştururken o koleksiyondan kayıt seçimi (bu özellik)

### İki Aşamalı Workflow
```
Aşama 1: Koleksiyon Tanımla
   └─> CollectionKeyAutocomplete ile hedef koleksiyon seç
       Örnek: "ders" koleksiyonunda "donem" field'ı → ref: "donem"
       
Aşama 2: Entry Oluştur
   └─> RefFieldAutocomplete ile "donem" koleksiyonundan kayıt seç
       Örnek: "2024 Bahar Dönemi" entry'sini seç
```

### Entegrasyon Örneği
```javascript
// 1. Adım: Koleksiyon tanımla (CollectionKeyAutocomplete kullanılır)
{
  key: "ders",
  fields: [
    {
      key: "donem",
      type: "ref",
      ref: "donem"  // ← CollectionKeyAutocomplete ile seçildi
    }
  ]
}

// 2. Adım: Entry oluştur (RefFieldAutocomplete kullanılır)
// "ders" entry'si oluştururken:
{
  data: {
    donem: "673f2a1b5e8c9d0012345678"  // ← RefFieldAutocomplete ile seçildi
  }
}
```

## �📦 Dosyalar

- **Component**: `apps/admin/src/pages/collections/components/RefFieldAutocomplete.jsx`
- **Entegrasyon**: `apps/admin/src/pages/collections/components/CollectionEntryModal.jsx`
- **API**: `apps/admin/src/lib/api/collections.js`
