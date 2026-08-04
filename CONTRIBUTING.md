# Contributing

## Zorunlu commit kimliği

Bu repository'deki yeni commitlerin GitHub yazarı yalnızca `devburak` olabilir.
`burak-imrek`, `burak.imrek` ve bu hesaba bağlı kimliklerle commit veya
co-author kaydı kabul edilmez.

Zorunlu yerel Git ayarı:

```bash
git config --local user.name "devburak"
git config --local user.email "dev.burak@gmail.com"
pnpm hooks:install
```

Repository hook'ları commit öncesinde yerel yazar/committer kimliğini kontrol
eder. GitHub Actions içindeki `Quality` işi ise PR veya korunan branch'e giren
her yeni commitin GitHub tarafında gerçekten `devburak` hesabına eşleştiğini
doğrular. Bu kontrol atlanamaz; kimlik hatası varsa commit doğru kimlikle yeniden
oluşturulmalıdır.

GitHub repository ayarlarında `main` ve `develop` branch'leri için aktif bir
ruleset bulunmalıdır. Ruleset, `Quality` status check'ini zorunlu tutmalı,
bypass'a izin vermemeli ve force-push'u engellemelidir. Bu korumaları kapatmak
commit kimliği politikasını ihlal eder.
