# Placement events and analytics

Record what visitors actually saw and did. A decision is not an impression, and a selected experience that never becomes visible should not inflate its performance.

## Collect events

Browser delivery uses tenant identity, not a private token:

```text
POST https://api.ctxhub.net/api/public/placements/event
POST https://api.ctxhub.net/api/public/placements/events/batch
X-Tenant-ID: your-tenant-id
```

The batch endpoint accepts at most 100 events. The supported event types are `impression`, `view`, `click`, `close`, `dismiss`, `submit`, `conversion`, and `error`.

```js
await fetch('https://api.ctxhub.net/api/public/placements/event', {
  method: 'POST',
  keepalive: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placementId,
    experienceId,
    type: 'conversion',
    sessionId,
    path: window.location.pathname,
  }),
})
```

Use the promo SDK's transport when possible. Batch high-volume interactions, retry transient failures with a bound, and never block navigation on analytics.

## Reporting surface

Authenticated tenant callers can query:

```text
GET /api/placements/:id/stats
GET /api/placements/:id/stats/totals
GET /api/placements/:id/stats/devices
GET /api/placements/:id/stats/browsers
GET /api/placements/:id/stats/top-pages
GET /api/placements/:id/stats/realtime
GET /api/placements/:id/ab-test
GET /api/placements/:id/experiences/:expId/funnel
GET /api/placements/journey
```

Use the main stats route for totals and time series, breakdown routes for delivery diagnostics, realtime data for operational checks, A/B and funnel routes for experiment outcomes, and journey for cross-event sequences.

## Measurement practices

- Define the conversion event and counting rule before launching.
- Use one stable `sessionId` across decisions and events in a visit.
- Send the exact selected `experienceId`; do not infer it from rendered copy.
- Keep personal data out of paths and arbitrary metadata.
- Monitor event failures separately from decision failures.
- Reconcile sudden rate changes with deployments, rule edits, schedules, and bot traffic.

Public event collection is rate-limited and tenant-scoped, but clients remain untrusted. Do not use placement analytics as a financial ledger or authorization source.
