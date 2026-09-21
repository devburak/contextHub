# ContextHub vs WordPress Multisite

WordPress Multisite and ContextHub both reduce the overhead of operating many sites,
but they start from different architectures. WordPress Multisite creates a network of
virtual sites that share one WordPress installation. ContextHub is an API-first
content platform whose users, roles, content, configuration and integration tokens
are scoped to tenants.

| Consideration | ContextHub | WordPress Multisite |
| --- | --- | --- |
| Primary model | Multi-tenant headless CMS and content services | Network of WordPress sites |
| Presentation | Any frontend consuming APIs or SDKs | WordPress themes, plugins and APIs |
| Isolation unit | Tenant context and `tenantId`-scoped resources | Sites share WordPress core and a database; site data uses separate tables |
| Administration | One React admin with tenant-aware roles | Network Admin plus individual site administration |
| Structured delivery | JSON and rendered HTML APIs | WordPress content model and REST API |
| Experiences | Placements, targeting, A/B tests, funnels and reporting in the platform | Usually assembled with plugins or custom development |
| Extensibility | Versioned Plugin API and domain events | Large WordPress theme and plugin ecosystem |

## Choose ContextHub when

* an agency needs one operational platform for multiple customer sites;
* content must serve websites, applications and other channels independently of the
  presentation layer;
* tenant-scoped roles, tokens, forms, webhooks and experiences should share one model;
* the team prefers Node.js, React, MongoDB and API-first integration.

## Choose WordPress Multisite when

* the sites should stay inside the WordPress theme and plugin ecosystem;
* editors and operators already depend on established WordPress workflows;
* the main requirement is a related network of websites rather than a reusable content
  and data API for several channels.

## Sources

* [Create a WordPress Multisite network](https://developer.wordpress.org/advanced-administration/multisite/create-network/)
* [Before you create a WordPress network](https://developer.wordpress.org/advanced-administration/multisite/prepare-network/)
* [WordPress Network Admin](https://developer.wordpress.org/advanced-administration/multisite/admin/)

Last reviewed: 2026-09-21.
