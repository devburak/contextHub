# contextHub

contextHub is a multi‑tenant headless CMS and content‑services platform built with the MERN stack.  The goal of this project is to provide a scalable, cloud‑native alternative to WordPress: a system that stores and renders web‑site content, exposes that content as an API, and offers a modern React‑based administration interface.

## Features

* **Multi‑tenant by design** – a single deployment can serve multiple domains/tenants.  Each tenant has its own users, roles, content and configuration.  The API ensures that data is always partitioned by `tenantId`.
* **Headless CMS** – content is stored as structured data (Lexical JSON) and served as JSON or HTML.  The system supports multiple content types (pages, posts, custom types), versioning, drafts and scheduled publishing.
* **Storage service** – integrated with [Cloudflare R2](https://www.cloudflare.com/products/r2/) for storing images, documents and other assets.  Files can be delivered via signed URLs or public links.
* **User management and RBAC** – users can be members of multiple tenants.  Roles (`Owner`, `Admin`, `Editor`, `Author`, `Viewer`) and domain‑scoped overrides define permissions.
* **Generic forms** – custom forms can be defined without code.  Submitted data is stored in the database and can trigger webhooks or notifications.
* **Analytics** – simple page‑view and event tracking endpoints with daily aggregations.
* **Presentation integration** – starter templates and an SDK allow building front‑end sites on top of contextHub.  APIs are provided to fetch content, sitemaps and navigation structures.
* **Tokens for service integration** – API tokens with fine‑grained scopes enable third‑party applications to consume the API securely.
* **Commerce lite** – a basic product catalogue (similar to WooCommerce) can be enabled per tenant.
* **Flexible custom data** – tenants can define their own collections based on JSON schema for bespoke applications (e.g. election campaigns).
* **Third‑party communication** – e‑mail, SMS and push notification providers can be configured per tenant.  Message templates are managed through the CMS.

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
# Build and deploy in one command
pnpm deploy

# Or separately:
pnpm build:admin
pnpm deploy:admin
```

Deploy configuration is managed via environment variables in `.env`:

```env
adminUser=your_ssh_user
adminPassword=your_ssh_password
adminDeployPath=/path/to/deployment/directory
adminDeployServer=your.server.com
```

The deploy script will:
- Connect to the server via SSH
- Backup existing files
- Upload the production build
- Set correct file permissions

For more details, see [DEPLOY.md](./DEPLOY.md) or [DEPLOY-QUICK.md](./DEPLOY-QUICK.md).

### Contributing

The project uses conventional commits and enforces code style via ESLint and Prettier.  Tests should be written using `vitest`.  Pull requests must include unit tests and updates to documentation when relevant.

### License

This project is released under the MIT license.

