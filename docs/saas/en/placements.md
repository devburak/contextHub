# Placements and personalization

Placements let one frontend location serve different banners, popups, inline blocks, forms, media, or custom components. ContextHub Cloud keeps the definition, eligibility rules, weighted selection, event stream, and reports tenant-scoped.

## Core model

A placement has a stable `slug`, status, trigger, optional fallback, and one or more experiences. An experience combines presentation content with targeting rules, priority, weight, schedule, and frequency limits.

| Concept | Purpose |
| --- | --- |
| Placement | Named decision point such as `homepage-hero` or `checkout-exit` |
| Experience | Candidate content or component returned by a decision |
| Rule | Determines whether the request context is eligible |
| Priority | Limits selection to the highest-priority eligible group |
| Weight | Splits traffic among experiences in that group |
| Event | Records impressions, clicks, conversions, and other outcomes |

Supported experience content types are `form`, `html`, `text`, `image`, `video`, `component`, and `external`. Treat HTML and external URLs as untrusted presentation input. Content and media IDs are references; clients fetch the referenced resource separately.

## Management lifecycle

Placement reads require an authenticated tenant caller; create, update, archive, duplicate, and delete operations require an editor-level admin session.

```text
GET    https://api.ctxhub.net/api/placements
POST   https://api.ctxhub.net/api/placements
GET    https://api.ctxhub.net/api/placements/:id
PUT    https://api.ctxhub.net/api/placements/:id
DELETE https://api.ctxhub.net/api/placements/:id
POST   https://api.ctxhub.net/api/placements/:id/archive
POST   https://api.ctxhub.net/api/placements/:id/duplicate
```

Experiences have their own add, update, and delete operations below a placement. Prefer duplication when creating a campaign from a proven configuration; archive placements that must stop participating without losing their reporting context.

## Frontend workflow

1. Decide with the page and session context.
2. Render only the returned experience and honor its trigger.
3. Record an impression when it becomes visible, not merely when it is selected.
4. Record subsequent click, submit, close, or conversion events asynchronously.
5. Keep personalized decisions out of shared caches.

Use `@contexthub/promo-sdk` for React or vanilla integrations, or call the public endpoints directly. Continue with [Decision engine and targeting](./placement-decisions.md), [Experiences and A/B tests](./placement-experiments.md), and [Events and analytics](./placement-events.md).
