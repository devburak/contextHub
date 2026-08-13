# Collections

Use Collections for typed repeatable business data: branches, team members, products, events, FAQs, locations, reports, or any record set whose entries share a schema. A collection has a stable `key`, localized name, field definitions, and publication settings.

## When to use a collection

Choose a Collection when applications need field-level filtering, sorting, relations, localized enum labels, or GeoJSON. Choose Content when editors primarily author a rich narrative page with categories and publishing metadata.

## Field types

| Type | Typical use |
| --- | --- |
| `string`, `text` | Names, codes, short and long plain text |
| `richText` | Structured editor JSON plus renderable HTML |
| `number`, `boolean` | Numeric values and switches |
| `date`, `datetime` | Calendar dates and timestamped events |
| `enum` | Controlled options with localized labels |
| `ref` | Link to another collection entry |
| `media` | Link to a Media record |
| `geojson` | Map geometry; point coordinates use `[longitude, latitude]` |

Fields may be required, unique, indexed, or given a default value. The collection settings select the slug field, default sorting, draft behavior, versioning, and preview URL.

## Public entry shape

```json
{
  "id": "entry-id",
  "collectionKey": "locations",
  "slug": "istanbul-office",
  "status": "published",
  "data": {
    "name": "Istanbul Office",
    "location": { "type": "Point", "coordinates": [28.9784, 41.0082] }
  },
  "dataLabels": {},
  "relations": { "contents": [], "media": [], "refs": [] }
}
```

`data` contains schema-defined values. `dataLabels` contains locale maps for enum values. `relations` contains validated links to content, media, or other collection entries.

## List published entries

```bash
curl --get "https://api.ctxhub.net/api/public/collections/locations" \
  --header "X-Tenant-ID: your-tenant-id" \
  --data-urlencode "page=1" \
  --data-urlencode "limit=20"
```

Fetch one entry by slug:

```text
GET https://api.ctxhub.net/api/public/collections/locations/istanbul-office
X-Tenant-ID: your-tenant-id
```

Both public routes return published entries only.

## Query DSL

Use the public query endpoint for selected fields, filters, ordering, pagination, and controlled relation hydration:

```js
const response = await fetch('https://api.ctxhub.net/api/public/queries/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    collection: 'locations',
    select: ['slug', 'data.name', 'data.location'],
    where: [['data.isActive', 'eq', true]],
    orderBy: [['data.name', 'asc']],
    limit: 50,
  }),
})
```

Public collection endpoints are rate limited. Cache stable results and avoid issuing one query per component.

## Rich text and relations

A `richText` value is `{ json, html }`. Use `html` for display and sanitize it. Request `includeRelations` only when needed; each returned relation is still tenant- and publication-scoped.
