# Menus and forms

ContextHub Cloud includes managed delivery resources beyond Content, Collections, and Media. Personalized delivery and experiments have their own [Placements and personalization](./placements.md) section.

## Menus

Menus model navigation trees independently of page templates. Fetch a menu by stable slug or configured location:

```text
GET https://api.ctxhub.net/api/public/menus/slug/main
X-Tenant-ID: your-tenant-id
```

Preserve item ordering and hierarchy. Validate external URLs before rendering them.

## Forms

Forms define labels, validation, field types, consent text, and submission behavior. Load a public form with:

```text
GET https://api.ctxhub.net/api/public/forms/contact
X-Tenant-ID: your-tenant-id
```

Form submission requires a write-scoped API token even though the route is under `/public/forms`. Proxy the submission through your trusted backend, apply bot protection, and show structured validation errors in the UI.

## Delivery rules

- Public reads still require a tenant identity and configured CORS origin.
- Public responses must contain published, sanitized data only.
- Cache stable definitions briefly and refresh them from webhooks.
- Treat rendered HTML and external URLs as untrusted presentation input.
