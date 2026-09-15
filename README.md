# contextHub

contextHub is a multi‑tenant headless CMS and content‑services platform built with the MERN stack.  The goal of this project is to provide a scalable, cloud‑native alternative to WordPress: a system that stores and renders web‑site content, exposes that content as an API, and offers a modern React‑based administration interface.

## Features

* **Multi‑tenant by design** – a single deployment can serve multiple tenants and sites. Each tenant has its own users, roles, content and configuration. The API partitions tenant data by `tenantId`.
* **Headless content platform** – editorial content is stored as structured data (Lexical JSON) and served as JSON or HTML, with drafts and scheduled publishing.
* **Storage service** – integrated with [Cloudflare R2](https://www.cloudflare.com/products/r2/) for storing images, documents and other assets.  Files can be delivered via signed URLs or public links.
* **Placements and experiments** – tenant-aware decision rules, weighted experiences, frequency caps, event collection, A/B-test reporting, funnels, realtime statistics and journeys power personalized banners, popups and inline experiences.
* **User management and RBAC** – users can be members of multiple tenants. System roles (`Owner`, `Admin`, `Editor`, `Author`, `Viewer`) and tenant-scoped custom roles define permissions.
* **Generic forms** – custom forms can be defined without code.  Submitted data is stored in the database and can trigger webhooks or notifications.
* **Analytics** – placement events, A/B-test and funnel reports, realtime breakdowns, journeys and dashboard API-usage summaries are available through tenant-scoped endpoints.
* **Presentation integration** – APIs and SDKs support content, collections, media, menus, forms and placements in custom frontends.
* **Tokens for service integration** – owner-managed API tokens combine a role with read, write and delete scopes, optional expiry and revocation.
* **Flexible custom data** – tenants can define their own collections based on JSON schema for bespoke applications (e.g. election campaigns).
* **Open extension contract** – trusted deployment plugins can register API routes, event consumers, tenant settings and admin contributions through the versioned [Plugin API](./docs/PLUGIN_API.md).

The hosted ContextHub Cloud product, operational guidance and managed capabilities are documented at [ctxhub.net/docs](https://ctxhub.net/docs). Features that are not backed by a working route or service are intentionally not listed above.

## Monorepo structure

This repository follows a **modular monorepo** layout using [pnpm workspaces](https://pnpm.io/workspaces).  All packages share a single `node_modules` directory.  The top-level `package.json` exposes common scripts, while each app or package has its own package definition.

```
contextHub/
├── apps/
│   ├── api/        # Fastify back‑end service
│   └── admin/      # React admin interface (placeholder for now)
├── packages/
│   └── common/     # Shared code (types, utilities, RBAC, etc.)
├── scripts/        # Helpers to execute shared tooling (eslint, prettier, vitest)
├── pnpm-workspace.yaml
├── package.json    # root package with workspace configuration
└── README.md       # this file
```

### Shared tooling

Tooling that every package uses (ESLint, Prettier, Vitest, etc.) now lives only in the root `package.json`.  Workspace scripts call `node ../../scripts/run-tool.mjs <binary> [...args]`, which delegates to the single copy of the CLI in `node_modules/.bin`.  This keeps package manifests lean, ensures the per-package `node_modules` folders contain just workspace links, and avoids duplicating the same devDependencies across the monorepo.  A shared `.eslintrc.cjs` at the repo root defines the base lint rules so all packages lint consistently.

### Installation

Prerequisites:

* Node.js 18 or newer (the project targets Node 22 for production; development works with Node ≥18).
* [pnpm](https://pnpm.io/) (`npm install -g pnpm`).  pnpm is required to manage workspaces.

To bootstrap the repository:

```bash
pnpm install
```

This will install all dependencies and link packages together.  To start the back‑end service in development mode:

```bash
pnpm dev:api
```

The API will start at [http://localhost:3000](http://localhost:3000) with a `/health` endpoint.  Environment variables can be set via a `.env` file at the root of the repository (see `.env.example` when available).

### Deployment

#### Admin Panel Deployment

To deploy the admin panel to a production server:

```bash
# Build and deploy one exact tagged release
pnpm deploy -- --release v0.1.6

# Or separately:
pnpm build:admin
pnpm deploy:admin -- --release v0.1.6
pnpm rollback:admin
```

Deploy configuration is managed via environment variables in `.env`:

```env
adminUser=your_ssh_user
adminPassword=your_ssh_password
adminDeployPath=/path/to/deployment/directory
# Optional; defaults to "${adminDeployPath}.releases"
adminDeployReleaseRoot=/path/to/immutable/admin-releases
adminDeployServer=your.server.com
```

The deploy script will:
- Refuse branches, floating tags, dirty trees, and tag/package version drift
- Upload once to an immutable `vX.Y.Z-<commit>` release directory
- Atomically switch `current` while preserving `previous`
- Roll back by atomically swapping `current` and `previous`

This public/core script deploys only the community-compatible admin artifact. Hosted
API releases that compose private plugins are owned by the `ctxhub-commercial`
release manifest, preflight, frozen lockfile, and entitlement verification flow; the
core deploy command must not copy private plugin sources into this repository.

For more details, see [DEPLOY.md](./DEPLOY.md) or [DEPLOY-QUICK.md](./DEPLOY-QUICK.md).

## Versioning and releases

The deployable core is released as a **single version**: the root `package.json`, `apps/*` and `packages/common` always carry the same number, and an annotated git tag points at it.  `@contexthub/promo-sdk` is excluded — it is published separately and keeps its own version.

Versions follow `MAJOR.MINOR.PATCH`.  While the core is below `1.0.0`, a minor bump may contain breaking changes; from `1.0.0` onward, breaking changes require a major bump.

```bash
# keep every core manifest on the same number
pnpm version:set 0.1.1

# verify they have not drifted (also runs in CI)
pnpm version:check
```

Cutting a release:

```bash
git checkout main && git merge --no-ff develop
pnpm version:set 0.1.1
git commit -am "chore(release): v0.1.1"
git tag -a v0.1.1 -m "v0.1.1"
git push origin main --follow-tags
```

Tags are **immutable**: never move or re-point a tag that has been pushed.  Deployments and downstream builds pin to a tag *and* its verified commit SHA, never to a branch.

## Extensions

The domain event contract and supported event types are documented in the
[Webhook & Domain Event Primer](./WEBHOOK_EVENTS.md). Runtime manifests, versioning,
consumer registration and the tenant-scoped read-only source facade are documented in
the [Plugin API](./docs/PLUGIN_API.md).

> **On extensions:** the core stays open source, and no capability that is already in this
> repository will be moved behind a paid tier.  Commercial add‑ons are built as separate
> plugins against the documented extension API, never as patches to the core.

### Contributing

The project uses conventional commits and enforces code style via ESLint and Prettier.  Tests should be written using `vitest`.  Pull requests must include unit tests and updates to documentation when relevant.

### License

This project is released under the MIT license.
