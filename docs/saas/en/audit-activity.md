# Audit log and activity

ContextHub exposes two different operational views. Use the persisted security activity log for accountable access changes; use the dashboard activity feed for recent editorial orientation. They are not interchangeable.

## Security activity log

```text
GET https://api.ctxhub.net/api/activities
GET https://api.ctxhub.net/api/activities/recent
```

The tenant-scoped log records supported authentication, session, security, API-token, membership, and related actions with actor, description, metadata, request IP, user agent, and time when available. `/activities` supports pagination plus `action` and `userId` filters; `/activities/recent` is a smaller recent view. The current routes require authentication but do not add a dedicated activity-view permission.

Activity log records have a 180-day retention index. Export them to your security or compliance system if your policy needs longer retention. Logging is designed not to break the primary product action when an audit write fails, so it is not a financial ledger or guaranteed write-ahead log.

Not every content edit is currently represented in this security collection. Do not advertise it as a complete immutable history of every field change.

## Dashboard activity feed

`GET /api/dashboard/activities` derives recent content, media, and form activity from current records. Owners may request tenant-wide or self scope; other roles are restricted to their own activity. It is useful for a dashboard, but it is not a persistent audit trail.

## Operational practice

- Gate activity pages or a server proxy to the oversight roles in your application, and do not issue broad credentials to dashboard consumers.
- Alert on token creation/deletion, membership changes, repeated authentication failures, and owner changes.
- Keep sensitive values out of free-form metadata.
- Correlate an incident with application and Edge Gateway logs using timestamps and safe identifiers.
- Export before the retention window expires when regulation or contracts require it.

For authorization design, see [Roles and permissions](./roles-permissions.md).
