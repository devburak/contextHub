# Content delivery

ContextHub exposes focused resources for pages, structured data, navigation, assets, and presentation rules. Prefer resource-specific endpoints over building an unrestricted query layer in a public client.

## Content

Use contents for editorial pages and reusable content records. Public delivery returns published records only. Fetch by stable slug where possible, and treat internal database IDs as opaque.

## Collections

Collections hold structured entries such as locations, products, speakers, or FAQs. Collection responses may include typed fields and references. Reference hydration must remain tenant-scoped and must not reveal drafts.

## Menus

Menus describe navigation trees. Render the returned hierarchy, preserve ordering, and decide explicitly how the application handles external links. Avoid caching a personalized navigation response in a shared cache.

## Media

Media responses provide metadata and delivery URLs. Use supplied variants when available, preserve intrinsic dimensions to reduce layout shift, and apply descriptive alternative text from the content model.

## Forms

Read a public form definition before rendering it. Submit only to the documented submission route and handle validation errors as structured input feedback. Add bot protection and a rate limit to internet-facing forms.

## Placements and popups

Placements provide targeting and display configuration. Keep eligibility evaluation deterministic, record analytics without blocking rendering, and avoid displaying the same placement repeatedly when frequency caps apply.

## Rendering pattern

```js
async function getPublishedContent({ apiUrl, tenantId, slug, signal }) {
  const response = await fetch(
    `${apiUrl}/api/public/contents/slug/${encodeURIComponent(slug)}`,
    {
      headers: { 'X-Tenant-ID': tenantId },
      signal,
    },
  )

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`ContextHub returned ${response.status}`)
  return response.json()
}
```

## Best practices

- Validate external URLs before rendering links.
- Render rich text with an allow-list sanitizer.
- Give every network request a timeout or abort signal.
- Distinguish empty content from a failed request in the UI.
- Preserve accessibility semantics from the content model.
- Use webhook invalidation instead of repeatedly polling for changes.
- Log tenant, route family, status, duration, and request ID without logging secrets.

See [Caching and freshness](./caching.md) for the recommended delivery cache hierarchy.
