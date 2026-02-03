# API Token Kullanım Kılavuzu

## Content-as-a-Service Nedir?

ContextHub, **Content-as-a-Service (CaaS)** yaklaşımıyla içeriklerinizi harici uygulamalara, web sitelerine, mobil uygulamalara ve diğer servislere güvenli bir şekilde sunmanızı sağlar. API Token sistemi sayesinde, kullanıcı kimlik doğrulaması gerektirmeden içeriklerinize programatik erişim sağlayabilirsiniz.

## API Token Nedir?

API Token'ları, ContextHub API'sine erişim için kullanılan güvenli, uzun ömürlü kimlik doğrulama anahtarlarıdır. JWT token'larından farklı olarak:

- ✅ Süre sınırı olmadan (veya uzun süreli) kullanılabilir
- ✅ Kullanıcı oturumu gerektirmez
- ✅ Belirli izinlerle (read, write, delete) sınırlandırılabilir
- ✅ İstendiğinde kolayca iptal edilebilir
- ✅ Her token `ctx_` prefix'i ile başlar ve kolayca tanımlanabilir

## Token Oluşturma

### Admin Panel Üzerinden

1. **Varlık Ayarları** sayfasına gidin
2. **API Token Yönetimi** bölümünü bulun
3. **Token Oluştur** butonuna tıklayın
4. Token bilgilerini doldurun:
   - **Token Adı**: Tanımlayıcı bir isim (örn: "Production Website")
   - **İzinler (Scopes)**:
     - `read`: İçerik okuma yetkisi
     - `write`: İçerik oluşturma ve güncelleme yetkisi
     - `delete`: İçerik silme yetkisi
     - **Not**: Scope seçilmezse varsayılan `read` olarak kabul edilir.
   - **Geçerlilik Süresi**:
     - 30 Gün
     - 90 Gün
     - 180 Gün
     - 1 Yıl
     - **Sınırsız** (production uygulamaları için önerilir)
5. Token'ı oluşturun ve **hemen kopyalayın** - bir daha görüntüleyemezsiniz!

### API Üzerinden

```bash
POST /api/api-tokens
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "Production Website",
  "scopes": ["read", "write"],
  "expiresInDays": 0
}
```

**Not**: `expiresInDays: 0` sınırsız süre anlamına gelir.

**Yanıt**:
```json
{
  "token": {
    "id": "507f1f77bcf86cd799439011",
    "token": "ctx_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
    "name": "Production Website",
    "scopes": ["read", "write"],
    "expiresAt": null,
    "createdAt": "2025-10-21T10:30:00.000Z"
  },
  "warning": "Save this token securely. You won't be able to see it again."
}
```

## Token Kullanımı

### Temel Kullanım

API isteklerinizde token'ı `Authorization` header'ında `Bearer` prefix'i ile gönderin:

```bash
curl -H "Authorization: Bearer ctx_your_token_here" \
     https://api.contexthub.com/api/contents
```

### JavaScript/Node.js Örneği

```javascript
const CONTEXTHUB_TOKEN = 'ctx_your_token_here';
const API_URL = 'https://api.contexthub.com/api';

// İçerikleri listele
async function getContents() {
  const response = await fetch(`${API_URL}/contents`, {
    headers: {
      'Authorization': `Bearer ${CONTEXTHUB_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  return data.contents;
}

// Yeni içerik oluştur
async function createContent(contentData) {
  const response = await fetch(`${API_URL}/contents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONTEXTHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(contentData)
  });

  return response.json();
}

// Kullanım
getContents().then(contents => {
  console.log('İçerikler:', contents);
});
```

### React Örneği

```jsx
import { useEffect, useState } from 'react';

const CONTEXTHUB_TOKEN = process.env.REACT_APP_CONTEXTHUB_TOKEN;
const API_URL = 'https://api.contexthub.com/api';

function BlogList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/contents?type=blog-post`, {
      headers: {
        'Authorization': `Bearer ${CONTEXTHUB_TOKEN}`
      }
    })
      .then(res => res.json())
      .then(data => {
        setPosts(data.contents);
        setLoading(false);
      })
      .catch(error => {
        console.error('Hata:', error);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  );
}
```

### Python Örneği

```python
import requests
import os

CONTEXTHUB_TOKEN = os.getenv('CONTEXTHUB_TOKEN')
API_URL = 'https://api.contexthub.com/api'

def get_contents():
    """İçerikleri getir"""
    headers = {
        'Authorization': f'Bearer {CONTEXTHUB_TOKEN}',
        'Content-Type': 'application/json'
    }

    response = requests.get(f'{API_URL}/contents', headers=headers)
    response.raise_for_status()

    return response.json()['contents']

def create_content(content_data):
    """Yeni içerik oluştur"""
    headers = {
        'Authorization': f'Bearer {CONTEXTHUB_TOKEN}',
        'Content-Type': 'application/json'
    }

    response = requests.post(
        f'{API_URL}/contents',
        json=content_data,
        headers=headers
    )
    response.raise_for_status()

    return response.json()

# Kullanım
if __name__ == '__main__':
    contents = get_contents()
    for content in contents:
        print(f"İçerik: {content['title']}")
```

### PHP Örneği

```php
<?php

$contextHubToken = getenv('CONTEXTHUB_TOKEN');
$apiUrl = 'https://api.contexthub.com/api';

function getContents($token, $baseUrl) {
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $baseUrl . '/contents',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        throw new Exception('API isteği başarısız: ' . $httpCode);
    }

    return json_decode($response, true)['contents'];
}

function createContent($token, $baseUrl, $contentData) {
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $baseUrl . '/contents',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($contentData),
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Kullanım
$contents = getContents($contextHubToken, $apiUrl);
foreach ($contents as $content) {
    echo "İçerik: " . $content['title'] . "\n";
}
```

## Güvenlik En İyi Uygulamaları

### 1. Token'ı Güvenli Saklayın

❌ **YAPMAYIN**: Token'ı kaynak koduna yazın
```javascript
const token = 'ctx_a1b2c3d4e5f6...'; // YANLIŞ!
```

✅ **YAPIN**: Ortam değişkenlerini kullanın
```javascript
const token = process.env.CONTEXTHUB_TOKEN; // DOĞRU!
```

### 2. Token'ları Asla Versiyon Kontrolüne Eklemeyin

`.gitignore` dosyanıza ekleyin:
```
# Environment variables
.env
.env.local
.env.production

# API tokens
*token*
*secret*
```

### 3. Frontend'de Token Kullanımı

⚠️ **DİKKAT**: Token'ları frontend'de (tarayıcı) kullanırken dikkatli olun!

**Önerilen Yaklaşım**: Backend proxy kullanın
```javascript
// Frontend - Token'ı göstermeyin
async function getContents() {
  const response = await fetch('/api/contents'); // Kendi backend'iniz
  return response.json();
}

// Backend (Node.js) - Token burada kullanılır
app.get('/api/contents', async (req, res) => {
  const response = await fetch('https://api.contexthub.com/api/contents', {
    headers: {
      'Authorization': `Bearer ${process.env.CONTEXTHUB_TOKEN}`
    }
  });
  const data = await response.json();
  res.json(data);
});
```

### 4. Minimum İzin Prensibi

- Sadece gerekli scope'ları verin
- Sadece okuma gereken uygulamalar için `read` scope'u yeterli
- Her uygulama için ayrı token oluşturun

### 5. Token Rotasyonu

- Production tokenları düzenli olarak yenileyin
- Eski token'ları iptal edin
- Güvenlik ihlali durumunda hemen token'ı silin

### 6. İzleme ve Denetim

- Token kullanımını düzenli olarak kontrol edin
- `lastUsedAt` alanına bakarak kullanılmayan token'ları tespit edin
- Şüpheli aktivite durumunda token'ı iptal edin

## Token Yönetimi

### Token Listeleme

```bash
GET /api/api-tokens
Authorization: Bearer YOUR_JWT_TOKEN
```

**Yanıt**:
```json
{
  "tokens": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Production Website",
      "scopes": ["read", "write"],
      "expiresAt": null,
      "lastUsedAt": "2025-10-21T12:30:00.000Z",
      "createdAt": "2025-10-20T10:00:00.000Z",
      "createdBy": {
        "id": "507f191e810c19729de860ea",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### Token Silme

```bash
DELETE /api/api-tokens/:tokenId
Authorization: Bearer YOUR_JWT_TOKEN
```

## Hata Yönetimi

### Yaygın Hatalar

#### 1. 401 Unauthorized - Geçersiz Token
```json
{
  "error": "Unauthorized",
  "message": "Invalid token"
}
```

**Çözüm**: Token'ın doğru olduğundan ve süresi dolmadığından emin olun.

#### 2. 403 Forbidden - Yetersiz İzin
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

**Çözüm**: Token'ın gerekli scope'lara sahip olduğundan emin olun.

#### 3. 404 Not Found - Kaynak Bulunamadı
```json
{
  "error": "NotFound",
  "message": "Resource not found"
}
```

**Çözüm**: URL'yi ve kaynak ID'sini kontrol edin.

## Rate Limiting

API istekleri, abonelik planınıza göre sınırlandırılmıştır:

- **Free Plan**: 1,000 istek/ay
- **Starter Plan**: 10,000 istek/ay
- **Professional Plan**: 100,000 istek/ay
- **Enterprise Plan**: Sınırsız

Rate limit aşıldığında:
```json
{
  "error": "TooManyRequests",
  "message": "Rate limit exceeded",
  "retryAfter": 3600
}
```

Aylık istek limiti aşıldığında:
```json
{
  "error": "RequestLimitExceeded",
  "message": "Aylık API isteği limiti aşıldı. Lütfen paketinizi yükseltin veya yeni dönemi bekleyin.",
  "messages": {
    "tr": "Aylık API isteği limiti aşıldı. Lütfen paketinizi yükseltin veya yeni dönemi bekleyin.",
    "en": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle."
  },
  "limit": 10000,
  "usage": 10000,
  "periodKey": "2026-02",
  "resetAt": "2026-03-01T00:00:00.000Z"
}
```

## API Usage Sync (Cron)

Bu uç, 12 saatlik kullanım verisini Redis'ten MongoDB'ye taşır ve limit flag'lerini günceller. Üretimde `CRON_SECRET_TOKEN` zorunludur.

**Örnek cURL**
```bash
curl -X POST \"https://api.contexthub.com/api/api-usage-sync/trigger\" \\
  -H \"x-cron-secret: YOUR_SECRET\" \\
  -H \"Content-Type: application/json\"
```

**Örnek cron (UTC, 00:00 ve 12:00)**
```cron
0 0,12 * * * curl -sS -X POST \"https://api.contexthub.com/api/api-usage-sync/trigger\" -H \"x-cron-secret: YOUR_SECRET\"
```

**Örnek cron (UTC, 4 saatte bir)**
```cron
0 */4 * * * curl -sS -X POST \"https://api.contexthub.com/api/api-usage-sync/trigger\" -H \"x-cron-secret: YOUR_SECRET\"
```

## SSS (Sık Sorulan Sorular)

### Token'ımı kaybettim, nasıl geri alabilirim?
Token'lar güvenlik nedeniyle sadece oluşturulduğunda bir kez gösterilir. Kaybettiyseniz, eski token'ı silin ve yeni bir token oluşturun.

### Bir token'ın kaç API isteği yapabileceğinde limit var mı?
Hayır, token başına istek limiti yoktur. Ancak tenant başına aylık API istek limitleri vardır.

### Token'lar tenant'lar arasında paylaşılabilir mi?
Hayır, her token belirli bir tenant'a aittir ve sadece o tenant'ın kaynaklarına erişebilir.

### Token scope'larını sonradan değiştirebilir miyim?
Şu anda hayır. Scope'ları değiştirmek için mevcut token'ı silip yeni bir token oluşturmanız gerekir.

### Sınırsız token'lar güvenli mi?
Evet, ancak dikkatli kullanılmalıdır. Production ortamlarında sınırsız token'lar önerilir, ancak token'ı güvenli saklamak ve düzenli olarak rotasyona tabi tutmak önemlidir.

## İleri Düzey Kullanım

### Webhook'larla Entegrasyon

Token'larınızı webhook sistemleriyle kullanarak otomatik iş akışları oluşturabilirsiniz:

```javascript
// Webhook endpoint'iniz
app.post('/webhook/contexthub', async (req, res) => {
  const event = req.body;

  // Yeni içerik yayınlandığında, otomatik olarak cache'i güncelle
  if (event.type === 'content.published') {
    const response = await fetch(`https://api.contexthub.com/api/contents/${event.contentId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.CONTEXTHUB_TOKEN}`
      }
    });

    const content = await response.json();
    await updateCache(content);
  }

  res.sendStatus(200);
});
```

### Caching Stratejileri

API isteklerini azaltmak için caching kullanın:

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 dakika

async function getContentsWithCache() {
  // Cache'i kontrol et
  const cached = cache.get('contents');
  if (cached) return cached;

  // API'den getir
  const response = await fetch('https://api.contexthub.com/api/contents', {
    headers: {
      'Authorization': `Bearer ${process.env.CONTEXTHUB_TOKEN}`
    }
  });

  const data = await response.json();

  // Cache'e kaydet
  cache.set('contents', data.contents);

  return data.contents;
}
```

## Destek ve Kaynaklar

- **API Dokümantasyonu**: https://api.contexthub.com/docs
- **Swagger UI**: https://api.contexthub.com/docs (Canlı API testi)
- **GitHub**: https://github.com/contexthub/contexthub
- **Destek**: support@contexthub.com

## Güncellemeler

Bu belge, API Token sistemi güncellendiğinde düzenli olarak güncellenir. Son güncelleme: 21 Ekim 2025
