# ContextHub Cloud vs self-hosted

ContextHub is open-core: the community repository provides inspectable core contracts and an application foundation, while ContextHub Cloud at `ctxhub.net` provides an operated multi-tenant service. Choosing between them is a responsibility decision, not only a hosting decision.

## Trust boundary

| Responsibility | Community self-hosted | ContextHub Cloud |
| --- | --- | --- |
| Runtime deployment and scaling | Your team | Operated by ContextHub |
| Database, object storage, backups, and restore testing | Your team | Managed according to the Cloud service and plan |
| TLS, edge routing, tenant CORS, origin protection, and abuse controls | Your team designs and operates them | Managed Edge Gateway |
| Upgrades, security patches, and compatibility validation | Your team | Managed release process |
| Monitoring, incident response, and capacity planning | Your team | Operated service responsibility according to plan |
| Core content, collection, media, menu, form, and placement contracts | Available according to repository version | Hosted and maintained |
| Semantic Search and commercial plugins | Not included unless explicitly published or separately licensed | Plan- and entitlement-dependent managed capabilities |
| Support | Community channels and your operators | ContextHub support according to plan |

Public source visibility does not mean that private provider code, production infrastructure, credentials, commercial packages, customer data, or an availability commitment is included.

## Choose ContextHub Cloud when

- You want a production API at `https://api.ctxhub.net/api` without operating the full stack.
- Multiple customer tenants need managed isolation, edge policy, upgrades, backups, and support.
- A plan-dependent capability such as managed Semantic Search is part of the product roadmap.
- Your team wants to focus on websites and applications rather than CMS infrastructure.

## Choose self-hosted when

- You must own the complete runtime, data plane, deployment schedule, and infrastructure controls.
- Your team can operate MongoDB, Redis, object storage, email, queues, edge security, monitoring, backups, and recovery.
- You accept responsibility for validating upgrades and maintaining compatibility with your integrations.
- The community repository's published functionality is sufficient without assuming managed or commercial capabilities.

## Portability expectations

Build against documented REST and webhook contracts, keep tenant identifiers explicit, and avoid depending on private provider resources. This makes application code easier to reason about across environments, but it does not guarantee that every Cloud capability exists in a community deployment.

Before a migration, inventory:

1. Core resources and content schemas.
2. Media storage and public URLs.
3. Tenant settings, origins, and secrets.
4. Webhook consumers and cache invalidation.
5. Commercial plugin entitlements and fallbacks.
6. Operational targets for backup, recovery, monitoring, and incident response.

See [Managed and commercial capabilities](./managed-capabilities.md) for the feature boundary and [ContextHub Edge Gateway](./edge-gateway.md) for the Cloud integration contract.
