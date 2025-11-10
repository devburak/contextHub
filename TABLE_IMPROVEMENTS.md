# Lexical Table Plugin Iyileştirmeleri

## Sorunlar ve Çözümler

### 1. Hücre İçi Metin Girişi Sorunları
**Problem**: İlk hücreye yazarken yazı son hücreye gidiyor
**Çözüm**: 
- `TableCellNode.jsx`'de basit click event listener kaldırıldı
- Lexical'ın native focus mekanizması kullanılıyor
- `data-lexical-editor="true"` attribute eklendi

### 2. Hücre Navigasyonu - Tab Tuşu Desteği
**Yenilik**: `TableCellFocusPlugin` oluşturuldu
- **Tab**: Sonraki hücreye git (satır sonunda altsatıra geç)
- **Shift+Tab**: Önceki hücreye git (satır başında üstsatıra geç)
- **Double-Click**: Hücre içeriğini düzenleme moduna al

### 3. Google Docs Tarzı Görünüm
**CSS Iyileştirmeleri**:
- Hücre focus: Sarı outline (#f59e0b) + inner shadow
- Multi-cell selection: Mavi highlight + rounded corners
- Hover efektler: Subtle gray background
- Smooth transitions: 0.15s ease

## Fiiller

### Dosya Değişiklikleri:
1. **apps/admin/src/pages/contents/nodes/TableNode.jsx**
   - `createDOM()`: Click event listener kaldırıldı
   - `data-lexical-editor="true"` eklendi

2. **apps/admin/src/pages/contents/plugins/TableCellFocusPlugin.jsx** (YENİ)
   - Tab/Shift+Tab navigasyonu
   - Double-click edit mode
   - Arrow key handling

3. **apps/admin/src/pages/contents/ContentEditor.jsx**
   - `TableCellFocusPlugin` import ve render eklendi

4. **apps/admin/src/pages/contents/ContentEditor.css**
   - `.editor-table-cell:focus-within` styling
   - Multi-cell selection classes
   - Transition efektleri

## Test Adımları

### 1. Temel Hücre Edit İşlemleri
- [ ] Tablo oluştur
- [ ] İlk hücreye tıkla ve yazı yaz
- [ ] 2. hücreye tıkla ve yazı yaz - yazı 2. hücreye mi gidiyor?
- [ ] Hücre içinde yazı seçebiliyor mu?

### 2. Tab Navigasyonu
- [ ] Tab tuşuna bas - sonraki hücreye mi gidiyor?
- [ ] Shift+Tab tuşuna bas - önceki hücreye mi gidiyor?
- [ ] Satır sonunda Tab - altdaki satırın ilk hücresine gidiyor mu?

### 3. Double-Click
- [ ] Hücreye double-click - içerik düzenleniyor mu?
- [ ] Imleç hücre içinde çalışıyor mu?

### 4. Visual Feedback
- [ ] Hücre hover: Gri background görülüyor mu?
- [ ] Hücre focus: Sarı outline görülüyor mu?
- [ ] Multi-cell seçim: Mavi highlight görülüyor mu?

## Kalan Iyileştirmeler

1. **Sağ Tık Context Menu**
   - Hücre birleştir/ayır
   - Satır/Sütun ekle/sil
   - Hücre rengi

2. **Keyboard Shortcuts**
   - Cmd/Ctrl+A: Tüm hücre içeriğini seç
   - Cmd/Ctrl+Backspace: Satırı sil
   - etc.

3. **Responsive Design**
   - Mobile'da tablo düzenlemesi
   - Horizontal scroll handling

4. **Performance**
   - Large table handling (100+ rows)
   - Virtualization?

## Yapılandırma

Mevcut ayarlar `TableCellFocusPlugin`'de yapılabilir:
- Tab davranışı (custom navigation logic)
- Arrow key handling
- Enter tuşu davranışı
