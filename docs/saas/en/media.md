# Media

Use Media to manage uploaded images and files, generated image variants, accessibility text, tags, and external video records. Media separates reusable assets from Content and Collection records, which reference media by ID.

## Media fields

| Field | Purpose |
| --- | --- |
| `sourceType` | `upload` or `external` |
| `url` | Primary delivery URL |
| `variants` | Generated named image sizes with URL, width, height, format, and byte size |
| `mimeType`, `size` | File type and size metadata |
| `width`, `height` | Intrinsic image dimensions |
| `altText` | Required accessibility description for meaningful images |
| `caption`, `description` | Editorial presentation metadata |
| `tags` | Asset organization and filtering |
| `status`, `isPublic` | Asset lifecycle and delivery intent |
| `provider`, `providerId`, `externalUrl` | External video or provider metadata |

## Upload flow

Uploads are a trusted server or admin operation. Use a write-scoped token with an author-or-higher role.

1. Request a presigned upload URL.
2. Upload the bytes directly to the returned URL.
3. Complete the media record with the returned `key`.

```js
const presign = await fetch('https://api.ctxhub.net/api/media/presign', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fileName: 'team-photo.jpg',
    contentType: 'image/jpeg',
    size: file.size,
  }),
}).then((response) => response.json())

await fetch(presign.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,
})

const { media } = await fetch('https://api.ctxhub.net/api/media', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    key: presign.key,
    originalName: 'team-photo.jpg',
    mimeType: 'image/jpeg',
    size: file.size,
    altText: 'ContextHub team in the Istanbul office',
    tags: ['team'],
  }),
}).then((response) => response.json())
```

Never send the API token to the browser. If browser uploads are required, your backend should authorize the user and request the presigned URL.

## Choose an image variant

Prefer a named variant appropriate to the layout, then fall back to `large`, `medium`, the first variant, and finally the root URL.

```js
function pickMediaUrl(media, preferred = 'large') {
  const variants = media?.variants || []
  return variants.find((item) => item.name === preferred)?.url
    || variants.find((item) => item.name === 'large')?.url
    || variants.find((item) => item.name === 'medium')?.url
    || variants[0]?.url
    || media?.url
}
```

Always render known width and height to prevent layout shift, and preserve `altText`.

## External media

Register YouTube, Vimeo, or another supported URL with `POST https://api.ctxhub.net/api/media/external`. Store provider metadata and a thumbnail, but embed only approved providers with a restrictive CSP.
