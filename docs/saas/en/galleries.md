# Galleries

Galleries group ordered tenant-owned media into an editorial unit that can be linked to one or more content records. Use them for slideshows, project portfolios, event albums, and reusable image sequences.

## Data model

A gallery has a title, optional description, `draft` or `published` status, linked content IDs, and ordered items. Each item references a media ID and can add its own title and caption. Gallery reads attach only media owned by the same tenant.

```text
GET    https://api.ctxhub.net/api/galleries
GET    https://api.ctxhub.net/api/galleries/:id
POST   https://api.ctxhub.net/api/galleries
PUT    https://api.ctxhub.net/api/galleries/:id
DELETE https://api.ctxhub.net/api/galleries/:id
PUT    https://api.ctxhub.net/api/contents/:id/galleries
```

List requests support search, `contentId`, page, and a limit up to 100. Editors can create and update galleries. A gallery must be moved to `draft` before deletion; deleting a published gallery returns `409 GALLERY_MUST_BE_DRAFT`.

## Delivery practice

- Preserve the explicit item order instead of sorting media again.
- Render item captions together with media alt text; they serve different purposes.
- Expect a referenced media item to become unavailable and provide a visual fallback.
- Cache published gallery reads briefly and invalidate both gallery and linked-content keys after edits.
- Do not reuse media IDs across tenants.

See [Media](./media.md) for uploads, variants, and accessibility metadata.
