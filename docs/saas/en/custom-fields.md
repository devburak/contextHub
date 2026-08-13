# Custom field definitions

Custom field definitions give editorial content tenant-wide typed fields without hard-coding a new content model. Define the field before using its key in a content record.

```text
GET    https://api.ctxhub.net/api/custom-field-definitions
POST   https://api.ctxhub.net/api/custom-field-definitions
PUT    https://api.ctxhub.net/api/custom-field-definitions/:id
DELETE https://api.ctxhub.net/api/custom-field-definitions/:id
```

Definition management requires an authenticated editor. Admin sessions can read all definitions; API-token reads expose only definitions marked `public`.

## Supported types

`text`, `number`, `boolean`, `date`, `select`, `multi-select`, `url`, `json`, `reference`, and `multi-reference` are supported. Select types include option definitions. Reference fields may declare `referenceCollectionKey` as metadata.

Keys are normalized and immutable after creation. Keep a flat tenant-wide naming convention such as `seo_title` or `event_speakers`; do not reuse one key with incompatible meanings.

## Delivery controls

- `public` controls whether API-token consumers can discover the definition.
- `filterable` and `searchable` control index participation and can trigger index rebuilding when changed.
- `defaultValue` is descriptive configuration; the server does not automatically write it into existing or newly saved content.
- `referenceCollectionKey` documents intent but is not currently server-enforced or automatically dereferenced.

Validate values in your editor and consumer. Treat reference IDs as tenant-scoped pointers, fetch their targets through the relevant API, and do not assume a deleted definition removes stored content values.

For using the resulting values, see [Content](./content.md).
