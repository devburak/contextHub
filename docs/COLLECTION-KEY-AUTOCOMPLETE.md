# Koleksiyon Key Autocomplete Özelliği

## 📋 Genel Bakış

Koleksiyon tanımlama formunda **ref** tipindeki field'lar için "Hedef Koleksiyon (key)" alanı artık akıllı autocomplete özelliğine sahip! Kullanıcılar mevcut koleksiyonlardan seçim yapabilir veya yeni bir key yazabilirler.

## ✨ Özellikler

### 1. **Mevcut Koleksiyonlardan Seçim**
- Input'a tıklandığında aktif koleksiyonlar listelenir
- Her koleksiyonun key'i, adı ve alan sayısı gösterilir
- Seçili koleksiyon mavi arka plan ve ✓ işareti ile belirtilir

### 2. **Gerçek Zamanlı Arama**
- Koleksiyon key veya adına göre filtreleme
- Anlık arama sonuçları
- İlk 10 sonuç gösterilir

### 3. **Manuel Girdi Desteği**
- Arama sonucunda koleksiyon bulunamazsa manuel key girilebilir
- "Girdiğiniz key kullanılacak" mesajı ile bilgilendirme
- Otomatik slugification (kebab-case)

### 4. **Akıllı Filtreleme**
- Mevcut koleksiyon otomatik olarak listeden hariç tutulur (self-reference önlenir)
- Sadece aktif koleksiyonlar listelenir
- Temizle butonu ile hızlı sıfırlama

## 🎯 Kullanım

### Koleksiyon Tanımında

Bir koleksiyon oluştururken veya düzenlerken:

1. **Alan Ekle** butonuna tıklayın
2. Alan tipini **"Referans"** olarak seçin
3. **"Hedef Koleksiyon (key)"** alanına tıklayın
4. Açılan listeden bir koleksiyon seçin veya yeni key yazın

### Örnek Senaryo

```javascript
// Mevcut koleksiyonlar:
// - donem (Dönem Yönetimi)
// - egitmen (Eğitmenler)
// - kategori (Kategoriler)

// Yeni koleksiyon: "ders"
{
  key: "ders",
  name: "Dersler",
  fields: [
    {
      key: "ad",
      type: "string",
      label: { tr: "Ders Adı" }
    },
    {
      key: "donem",
      type: "ref",
      ref: "donem",  // ← Autocomplete ile seçildi
      label: { tr: "Dönem" }
    },
    {
      key: "egitmen",
      type: "ref",
      ref: "egitmen",  // ← Autocomplete ile seçildi
      label: { tr: "Eğitmen" },
      settings: { multiple: true }
    }
  ]
}
```

## 🔧 Teknik Detaylar

### Component: CollectionKeyAutocomplete

```jsx
<CollectionKeyAutocomplete
  value={field.refTarget}              // Seçili key
  onChange={(newValue) => {...}}       // Değer değiştiğinde
  placeholder="Hedef koleksiyon seçin" // Placeholder text
  excludeKey={currentCollectionKey}    // Hariç tutulacak key
/>
```

### API Entegrasyonu

- `collectionsApi.listCollectionTypes({ status: 'active' })`
- Sadece aktif koleksiyonlar çekilir
- React Query ile cache yönetimi
- Dropdown açıldığında tek sefer yüklenir

### Veri Gösterimi

Her koleksiyon için:
```
┌─────────────────────────────────────────┐
│ donem                              ✓    │ ← key (seçiliyse)
│ Dönem Yönetimi             3 alan       │ ← name, field count
└─────────────────────────────────────────┘
```

### Slugification

Girilen key otomatik olarak slugify edilir:
- `Dönem 2024` → `donem-2024`
- `Eğitmen Listesi` → `egitmen-listesi`
- `kategori-1` → `kategori-1` (değişmez)

## 🎨 UI/UX Özellikleri

### Dropdown Açıkken
- **Mavi arka plan**: Aktif olarak seçili koleksiyon
- **✓ İşareti**: Seçili koleksiyonun yanında
- **Hover efekti**: Mouse üzerine geldiğinde gri arka plan
- **Alan sayısı**: Koleksiyondaki field sayısı sağda

### Arama Sonucu Yok
```
┌─────────────────────────────────────────┐
│ Koleksiyon bulunamadı                   │
│ Girdiğiniz key kullanılacak: yeni-key  │
└─────────────────────────────────────────┘
```

### Boş Liste
```
┌─────────────────────────────────────────┐
│ Aktif koleksiyon bulunamadı             │
└─────────────────────────────────────────┘
```

## 📊 Karşılaştırma

### Öncesi
```jsx
<input 
  type="text" 
  placeholder="ornek: donem"
/>
```
- Manuel key girişi
- Yazım hataları
- Mevcut koleksiyonları bilmek gerekiyor
- Koleksiyon adlarını hatırlamak zor

### Sonrası
```jsx
<CollectionKeyAutocomplete
  value={refTarget}
  onChange={onChange}
  excludeKey={currentKey}
/>
```
- Mevcut koleksiyonları göster
- Arama ile hızlı bulma
- Görsel olarak seçim
- Yine de manuel girdi mümkün

## 🐛 Hata Durumları

### Self-Reference Engelleme
Koleksiyonun kendisine referans vermesi engellenir:
```javascript
// "ders" koleksiyonu düzenlenirken
// excludeKey="ders" olduğu için
// "ders" listede görünmez
```

### API Hatası
Koleksiyonlar yüklenemezse:
- Dropdown boş görünür
- "Aktif koleksiyon bulunamadı" mesajı
- Manuel key girişi yapılabilir

## 🚀 Gelecek İyileştirmeler

- [ ] Koleksiyon detay tooltip'i (field listesi)
- [ ] Yeni koleksiyon oluştur butonu
- [ ] En son kullanılanlar önceliği
- [ ] Koleksiyon status göstergesi
- [ ] Favori koleksiyonlar
- [ ] Klavye navigasyonu (arrow keys, enter)

## 🔗 İlgili Özellikler

Bu özellik, **Ref Field Autocomplete** özelliği ile birlikte çalışır:

1. **CollectionKeyAutocomplete**: Koleksiyon tanımlarken hedef koleksiyon seçimi
2. **RefFieldAutocomplete**: Entry oluştururken o koleksiyondan kayıt seçimi

### Workflow
```
1. Koleksiyon Tanımla
   └─> CollectionKeyAutocomplete ile hedef koleksiyon seç
       
2. Entry Oluştur
   └─> RefFieldAutocomplete ile o koleksiyondan kayıt seç
```

## 📦 Dosyalar

- **Component**: `apps/admin/src/pages/collections/components/CollectionKeyAutocomplete.jsx`
- **Entegrasyon**: `apps/admin/src/pages/collections/components/CollectionDefinitionForm.jsx`
- **API**: `apps/admin/src/lib/api/collections.js`

## 📸 Ekran Görüntüsü Örneği

```
┌─────────────────────────────────────────────────────────┐
│ Alan Tipi: [Referans ▼]                                │
│                                                         │
│ Hedef Koleksiyon (key)                                 │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🔍 donem                                     ✕  │   │
│ └─────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Mevcut Koleksiyonlar                           │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ donem                                      ✓    │   │ ← Seçili
│ │ Dönem Yönetimi                       5 alan     │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ donem-gecis                                     │   │
│ │ Geçiş Dönemleri                      3 alan     │   │
│ └─────────────────────────────────────────────────┘   │
│ Mevcut koleksiyonlardan seçin veya yeni bir key yazın │
└─────────────────────────────────────────────────────────┘
```
