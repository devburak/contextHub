# Menus, forms, and placements

ContextHub Cloud includes managed delivery resources beyond Content, Collections, and Media.

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

## Placements

Placements select targeted popups, banners, inline experiences, or custom views. Applications send context to the managed decision endpoint and render the returned eligible experience.

```js
const response = await fetch('https://api.ctxhub.net/api/public/placements/decide', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placement: 'homepage-announcement',
    context: { path: '/', sessionId: crypto.randomUUID(), locale: 'en' },
  }),
})
```

Use the batch decision endpoint when a page needs several placement decisions. Record analytics asynchronously and honor frequency caps.

## Delivery rules

- Public reads still require a tenant identity and configured CORS origin.
- Public responses must contain published, sanitized data only.
- Cache stable definitions briefly and refresh them from webhooks.
- Never share personalized placement results through a global cache.
- Treat rendered HTML and external URLs as untrusted presentation input.
