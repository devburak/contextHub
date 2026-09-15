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

Yalnızca etkin tenant için belgelenmiş managed endpoint ve permission'ları kullanın. Uygulamanızı internal indexing altyapısına bağlamayın. Result ID'leri aday kabul edin ve ContextHub Cloud'un yeniden doğrulayarak döndürdüğü source payload'ı render edin.

SaaS/community sınırı için [Yönetilen ve ticari yetenekler](./managed-capabilities.md) sayfasına bakın.
