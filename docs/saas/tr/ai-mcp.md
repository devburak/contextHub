# AI asistanları ve MCP

ContextHub Cloud; grounded asistanlar, retrieval pipeline'ları ve read-only MCP araçları için İngilizce machine-readable doküman corpus'u yayımlar. İnsanlara yönelik Docs UI Türkçe çeviri de sunar; AI ingestion yalnızca İngilizce kaynakları kullanmalıdır.

## İngilizce AI corpus

- `/developer-docs/catalog.json`: locale metadata ve checksum içerir.
- `/developer-docs/en/{slug}.md`: canonical İngilizce dokümanları içerir.
- `/developer-docs/llms.txt`: yalnızca İngilizce dokümanları indeksler.
- `/developer-docs/llms-full.txt`: yalnızca İngilizce corpus'u birleştirir.

Değişmeyen sayfaları yeniden embedding etmemek için checksum kullanın. Slug, heading, version ve source URL'i retrieval metadata olarak saklayın.

## Grounding kuralları

- Corpus'u yönetilen `ctxhub.net` SaaS dokümanı olarak kabul edin.
- Open-core sözleşmelerle yönetilen/ticari yetenekleri ayırın.
- Endpoint, plan entitlement, permission veya config key uydurmayın.
- Doküman ve canonical İngilizce source URL'ini cite edin.
- Secret, private provider config veya cross-tenant veri taleplerini reddedin.
- Availability'nin ContextHub ile doğrulanması gerektiğinde bunu belirtin.

## Önerilen MCP araçları

| Tool | Amaç |
| --- | --- |
| `list_docs` | İngilizce title, description, checksum ve URL döndürür |
| `read_doc` | Catalog'daki tek slug için İngilizce Markdown döndürür |
| `search_docs` | Heading citation içeren sıralanmış İngilizce excerpt döndürür |
| `get_example_prompts` | Gözden geçirilmiş İngilizce prompt kütüphanesini döndürür |

Slug'ları catalog ile doğrulayın, response boyutunu sınırlayın, rate limit uygulayın ve public doküman sunucusunu read-only tutun. Private tenant içeriği ayrı authenticated ve tenant-scoped tool yüzeyi ister.

## Değerlendirme

Release öncesi auth sınırları, `api.ctxhub.net` URL doğruluğu, tenant izolasyonu, resource seçimi, managed/community ayrımı, citation, prompt injection ve refusal davranışını test edin.

Uygulama talimatları için [Prompt kütüphanesi](./prompt-library.md) sayfasını kullanın.
