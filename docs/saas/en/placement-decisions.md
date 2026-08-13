# Placement decision engine and targeting

The public decision API evaluates tenant-owned placement rules against explicit request context. It does not require or accept a private API token.

## Decide for one placement

```text
POST https://api.ctxhub.net/api/public/placements/decide
POST https://api.ctxhub.net/api/public/placements/decide-batch
```

```js
const response = await fetch('https://api.ctxhub.net/api/public/placements/decide', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placement: 'homepage-hero',
    context: {
      path: '/',
      sessionId: 'session-8e5d',
      locale: 'en',
      device: 'desktop',
      browser: 'chrome',
      authenticated: false,
      userTags: ['newsletter-subscriber'],
      featureFlags: ['new-home'],
    },
  }),
})
```

`placement`, `context.path`, and `context.sessionId` are required. Optional context includes locale, device, browser, operating system, authentication state, roles, user tags, feature flags, query parameters, cookies, referrer, user key, and previously seen frequency counters.

Use `POST /api/public/placements/decide-batch` when a page needs several decisions. This reduces network overhead while keeping each result independently eligible.

## Rule model

Rules can match paths and path modes, query values, locales, devices, browsers, operating systems, authentication state, roles, user tags, required or excluded feature flags, cookies, and referrers. Experiences can also have exclusion rules and active schedules.

Send only context you are permitted to process. Avoid raw personal data in tags, cookies, `userKey`, and analytics metadata.

## Selection order

ContextHub Cloud:

1. removes inactive, unscheduled, excluded, frequency-capped, or rule-mismatched experiences;
2. finds the highest priority among the remaining candidates;
3. performs weighted random selection only inside that priority group;
4. returns the configured fallback when no candidate is eligible.

Weights are relative, not percentages. Two candidates with weights `1` and `3` receive approximately 25% and 75% of eligible decisions over enough traffic.

## Frequency caps

An experience may define maximum views per session, day, week, month, or lifetime and may reset on conversion. The current public evaluator enforces session, day, and total from a client-supplied flat numeric `seenCaps` map. For cap key `summer-offer`, the keys are `summer-offer`, `summer-offer:YYYY-MM-DD`, and `summer-offer:total`. The promo SDK applies session, daily, and total checks in the browser from the returned frequency policy; direct clients that use server-side checks must maintain and send the map consistently.

Frequency controls improve experience quality but are not an authorization boundary. A client can alter local counters, so never use them to enforce entitlements or billing.

## Debug safely

Authenticated editors can call the placement debug operation with a test context to inspect a decision before publishing. Never expose the authenticated debug route or its response in browser code.

Next: [Experiences and A/B tests](./placement-experiments.md).
