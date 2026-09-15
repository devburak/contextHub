# Placement experiences and A/B tests

Experiences turn a placement into an experimentable delivery surface. They contain the render payload, eligibility rules, priority, weight, trigger, schedule, and frequency policy.

## Define experiences

Authenticated placement management exposes add, update, and delete operations:

```text
POST   https://api.ctxhub.net/api/placements/:id/experiences
PUT    https://api.ctxhub.net/api/placements/:id/experiences/:experienceId
DELETE https://api.ctxhub.net/api/placements/:id/experiences/:experienceId
```

Give each experience a durable name that survives copy changes. Keep one concern per experiment: if audience and creative both change, the report cannot tell which caused the result.

Available triggers include `onLoad`, `afterDelay`, `onScroll`, `onExit`, `onClick`, `onIdle`, `onHover`, `onTimeout`, and `manual`. The frontend is responsible for applying the returned trigger consistently.

## Set up an A/B test

1. Create two or more active experiences under one placement.
2. Give them the same priority so they enter the same selection group.
3. Set relative weights, such as `1` and `1` for an even split.
4. Keep eligibility rules and frequency policies equivalent unless they are the tested variable.
5. Instrument impression and conversion events before sending production traffic.
6. Run long enough to cover normal traffic cycles; do not stop only when a favorable result appears.

The decision engine performs weighted allocation, not deterministic user bucketing. Persist the chosen experience in your application when a visitor must remain in the same variant across a journey.

## Read results

```text
GET https://api.ctxhub.net/api/placements/:id/ab-test
GET https://api.ctxhub.net/api/placements/:id/experiences/:expId/funnel
```

The A/B report compares experience-level outcomes. The funnel endpoint shows the sequence of recorded steps for one experience. Interpret conversion rate together with sample size, collection quality, schedule, eligibility rules, and frequency caps.

## Release a winner

Prefer an explicit release change: increase the winner's priority or weight, archive losing experiences when appropriate, and retain the original measurement window in your own experiment notes. Duplicating the placement is useful when the next campaign needs a clean reporting identity.

Continue with [Events and analytics](./placement-events.md).
