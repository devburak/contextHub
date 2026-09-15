# Dashboard and API analytics

Agencies can build tenant dashboards from ContextHub's authenticated summary endpoints instead of scraping the admin UI.

```text
GET https://api.ctxhub.net/api/dashboard/summary
GET https://api.ctxhub.net/api/dashboard/activities
GET https://api.ctxhub.net/api/dashboard/api-stats
```

## Summary

`/dashboard/summary` returns tenant totals for users, content, and media, including aggregate media size. Use it for overview cards and capacity signals, not billing reconciliation.

## Recent editorial activity

`/dashboard/activities` returns current content, media, and form records ordered as recent create/update activity. It accepts type, scope, limit, and offset controls. Owners can request tenant-wide scope; other users are forced to self scope.

This feed is derived from current records and differs from the persisted [security activity log](./audit-activity.md).

## API usage statistics

`/dashboard/api-stats` returns whether collection is enabled plus four-hour, daily, today, weekly, and monthly views. Use [quota headers and usage](./quotas.md) for enforceable request limits; dashboard statistics are an operational view.

Cache dashboard responses briefly, label the last refresh time, and retain the raw period boundary in your own metrics so viewers do not compare mismatched windows.
