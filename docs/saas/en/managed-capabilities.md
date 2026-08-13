# Managed and commercial capabilities

ContextHub uses an open-core model. This documentation describes the `ctxhub.net` SaaS, so some capabilities are operated services or commercial plugins rather than features delivered by cloning the community repository.

For the operational responsibility and trust comparison, start with [ContextHub Cloud vs self-hosted](./cloud-vs-self-hosted.md).

## Capability boundary

| Capability | Community repository | ContextHub Cloud |
| --- | --- | --- |
| Core content, collection, media, menu, form, and placement contracts | Available according to repository version | Operated and upgraded for customers |
| Admin application and extension host | Available according to repository version | Hosted tenant administration |
| API edge, tenant CORS, origin protection, abuse controls | Integration contracts may be visible | Managed Edge Gateway service |
| Media storage and delivery operations | Adapter code may exist | Managed storage, variants, and delivery configuration |
| Semantic Search | Extension contracts only | Plan-dependent managed commercial capability |
| Private/commercial plugins | Not necessarily included | Enabled by entitlement and plan |
| Monitoring, backups, upgrades, and support | Self-managed | Operated service responsibility according to plan |

Repository visibility does not imply that private provider code, infrastructure configuration, secrets, commercial plugin packages, or an operated service is included.

## Entitlements and permissions

A commercial capability requires both tenant entitlement and user/service permission. Hiding a navigation item is not authorization; the API enforces the final decision. Capabilities may differ by plan, region, rollout stage, or tenant configuration.

## Integration rule

Build against the documented ContextHub Cloud API surface, not internal provider resources. Ask ContextHub support to confirm availability before making a plan-dependent capability a launch dependency.

## Support handoff

When reporting an issue, include tenant identifier, request ID, timestamp, route family, and observed status. Never include raw API tokens, webhook secrets, passwords, or customer personal data.
