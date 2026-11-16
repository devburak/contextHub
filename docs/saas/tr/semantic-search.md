# Yönetilen semantic search

Semantic Search plana bağlı bir ContextHub Cloud yeteneğidir. Yönetilen ticari servis olarak işletilir; community repoda çalıştırmaya hazır bir özellik olarak bulunmaz.

## Sağladıkları

- Onaylanmış tenant Content ve Collection alanlarında anlam tabanlı arama.
- Editoryal workflow için related-content önerileri.
- Tenant izole index'ler ve entitlement kontrollü erişim.
- Yönetilen indexing, retry, reconciliation, monitoring ve upgrade.

## Veri politikası

Yalnızca published kaynaklar ve açıkça onaylanmış alanlar uygundur. Varsayılan güvenli content seti title, summary, normalize body, categories ve tags'tir. Custom field ve collection field'ları tenant admin opt-in ister. Kişisel, secret veya hassas değerler default-deny kalır.

## Sonuç güvenliği

Search index eşleşmeleri adaydır, otorite değildir. ContextHub Cloud sonuç döndürmeden tenant ownership, existence, entitlement, permission ve güncel publication durumunu yeniden doğrular. Eski bir index kaydı deleted, unpublished veya cross-tenant içeriği görünür yapamaz.

## Etkinleştirme akışı

1. Tenant planında Semantic Search olduğunu doğrulayın.
2. Source type ve field allow-list'lerini ContextHub destek veya tenant admin deneyimiyle belirleyin.
3. Collection ve custom field'ları tek tek onaylayın.
4. İlk indexing'i çalıştırıp coverage'ı inceleyin.
5. Gerçek tenant query'leriyle relevance ölçün.
6. Public search'ü yalnızca explicit opt-in ve ayrı rate limit ile açın.

## Entegrasyon önerisi

### Sunucudan API token ile sorgulama

Semantic Search etkin ve `search.semantic` plan hakkı bulunan tenant'lar için `POST https://api.ctxhub.net/api/plugins/semantic-search/query` sunucudan sunucuya API token erişimini destekler. Yönetici oturumu açmak veya oturum çerezi taklit etmek gerekmez.

Token ayarlarında `write` (Yazma) kapsamı ve `semanticSearch.query` (Semantik arama ve öneri sorgula) ek özellik izni bulunmalıdır. Sorgu kaynak veriyi değiştirmez; `write` kapsamı, endpoint'in `POST` metodu kullanması nedeniyle gereklidir. Token'ı yalnızca sunucunuzda saklayın.

```bash
curl --request POST \
  'https://api.ctxhub.net/api/plugins/semantic-search/query' \
  --header "Authorization: Bearer ${CTXHUB_API_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"query":"haklı nedenle fesih","limit":3,"sourceTypes":["collectionEntry"]}'
```

Tenant token'dan belirlenir. Gövdede `tenantId` göndermeyin. Sunucudan yapılan isteğe `Origin` eklemek gerekmez; Cloudflare gateway token'ın hash kaydını, tenant durumunu ve token süresini doğrular. CORS listesi token yetkilendirmesinin yerine geçmez. Public search opt-in'i bu kimliği doğrulanmış entegrasyon için gerekli değildir.

| Alan | Açıklama |
| --- | --- |
| `query` | Zorunlu, 1–2000 karakterlik arama metni. |
| `limit` | 1–20; varsayılan 10. |
| `sourceTypes` | İsteğe bağlı dizi: `content`, `collectionEntry` veya ikisi. Verilmezse iki kaynak türü de aranır. |
| `excludeSourceIds` | İsteğe bağlı, en fazla 100 kaynak ID'si. |

`sourceType: "collection"` ve `collection: "chunks"` sorgu filtresi olarak desteklenmez. Koleksiyon kayıtları için `sourceTypes: ["collectionEntry"]` kullanın. Bu seçenek tenant'ın uygun tüm koleksiyonlarında arar; yalnızca tek bir koleksiyona göre sunucu filtresi mevcut değildir. Koleksiyon eşleşmeleri `sourceKey` alanında koleksiyon anahtarını döndürür.

Başarılı yanıt eşleşme kimliklerini ve skorlarını döndürür; kaynak kaydının tamamını içermez:

```json
{
  "schemaVersion": 1,
  "matches": [
    {
      "sourceType": "collectionEntry",
      "sourceKey": "chunks",
      "sourceId": "entry-id",
      "score": 0.87
    }
  ]
}
```

Sonuçlar döndürülmeden önce kaynakların aynı tenant'a ait ve halen `published` olduğu doğrulanır. Uygulamanız ihtiyaç duyduğu kaynak alanlarını ilgili içerik veya koleksiyon API'sinden okuyabilir. Sonuç bulunamazsa `matches` boş dizidir. Panelde kayıtların kuyruğa aktarılmış olması, indeksleme Worker'ının ve arama indeksinin tüm işleri tamamladığı anlamına gelmez.

### Rate limit ve hata yönetimi

`/query` için varsayılan limit tenant başına 60 saniyede 60 istektir. Aynı tenant'ın tüm token'ları ve yönetici oturumları ortak bütçeyi kullanır; sayaç API süreçleri arasında paylaşılır. Hizmet işletmecisi limiti değiştirebilir; yanıtın `X-RateLimit-Limit`, `X-RateLimit-Remaining` ve `X-RateLimit-Reset` başlıklarını esas alın. Limit aşımında `429 RateLimitExceeded` döner. `Retry-After` başlığındaki saniye kadar bekleyin; her tuş vuruşunda sorgulamak yerine debounce veya sunucu tarafı önbellek kullanın.

| Yanıt | Kontrol |
| --- | --- |
| `401` | Token'ın `Authorization: Bearer ctx_…` biçiminde, geçerli ve süresi dolmamış olduğunu doğrulayın. Edge policy yanıtında token'ın gateway kaydını destek ekibine kontrol ettirin. |
| `403` | `write` kapsamı, `semanticSearch.query` izni, tenant durumu ve `search.semantic` plan hakkını kontrol edin. `Origin` gönderiliyorsa tenant'ın izin verilen origin listesinde olmalıdır. |
| `403 SessionRequired` | `GET/PUT /policy`, `GET /indexing`, `POST /reindex` ve `POST /content-suggestions` yönetici oturumu ister. Güncel `/query` rotası API token kabul eder; burada bu hata sürerse destek ekibine endpoint, zaman ve varsa `CF-Ray`/istek kimliğini iletin. |
| `429` | `Retry-After` süresini bekleyin. |
| `5xx` | Geçici servis bağımlılığı hatası olabilir; sınırlı geri çekilme ile yeniden deneyin. Ortak rate limit deposu erişilemiyorsa arama çalıştırılmaz. |

Uygulamanızı internal indexing altyapısına veya Query Worker'ın gizli anahtarına bağlamayın. Anonim public semantic search ayrıca opt-in, entitlement ve rate limit gerektirir; API token erişimi bunu otomatik açmaz.

SaaS/community sınırı için [Yönetilen ve ticari yetenekler](./managed-capabilities.md) sayfasına bakın.
