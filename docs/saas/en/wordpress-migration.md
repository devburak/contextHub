# Migrate from WordPress

ContextHub Migrator moves WordPress posts and related media into ContextHub Cloud from the WordPress admin. It is designed for staged agency migrations where editors need dry-run visibility, category mapping, duplicate-safe content writes, and resumable media processing.

The migrator is a separately distributed WordPress plugin for ContextHub Cloud. It is not part of the community repository's Node runtime. Obtain the current signed package and release notes from ContextHub support or your managed-service channel.

## Before you start

- Back up the WordPress database and `wp-content/uploads`.
- Create a dedicated ContextHub API token with `write` scope. Revoke it after migration if it is no longer needed.
- Record the target tenant ID; do not reuse a token or tenant setting from another customer.
- Inventory post types, taxonomies, custom fields, galleries, embeds, redirects, and SEO metadata.
- Define a rollback and content-freeze window before the final cutover.
- Confirm plan storage and request quota headroom for the migration batch.

The published plugin package requires PHP 7.4 or newer. Verify the WordPress minimum against the package manifest before installation.

## Install and connect

1. In WordPress Admin, open **Plugins → Add New → Upload Plugin**.
2. Upload the supplied ContextHub Migrator ZIP and activate it.
3. Open **ContextHub → Settings**.
4. Set API URL to `https://api.ctxhub.net/api`.
5. Enter the dedicated `ctx_` API token and target tenant ID.
6. Test the connection, then save.

The token is sent as `Authorization: Bearer ctx_your_token`. Keep the migration inside WordPress Admin and do not expose the token to public JavaScript, page source, logs, or screenshots.

## Map and dry-run

Map every WordPress category to an existing ContextHub category or explicitly create a new target. Resolve duplicate or ambiguous slugs before running a large batch.

Start with a representative sample:

1. Select posts that cover headings, lists, links, galleries, featured images, captions, downloads, and video embeds.
2. Enable **Dry run**.
3. Review unconverted URLs, unsupported markup, category choices, and planned media actions.
4. Fix the source or mapping and repeat until the report is clean enough for the agreed acceptance criteria.

Dry-run mode does not replace a staging tenant. For high-risk migrations, validate the whole process against a non-production tenant first.

## Run the migration

The plugin converts supported WordPress HTML to ContextHub's Lexical representation and can transfer:

- Posts, titles, slugs, publish dates, status, and WordPress source metadata.
- Categories and category mappings.
- Featured images and images embedded in post content.
- Lazy-loaded image sources, captions, linked files, and media references.
- Galleries associated with migrated content.
- YouTube/Vimeo and theme-level featured-video metadata when recognized by the installed plugin version.

Run bounded batches, watch the real-time log, and pause when `429` or repeated `5xx` responses appear. The client retries transient `408`, `429`, network, and `5xx` failures with bounded backoff, but plan-quota exhaustion requires waiting for reset or changing the plan.

## Duplicate and recovery behavior

Re-running a migration must not blindly overwrite unrelated content. The migrator uses stored ContextHub IDs, slug checks, and publish-date windows to recover stale mappings and perform duplicate-safe create or update decisions.

Recovery Mode is only for a known scenario where media objects already exist in managed storage and should be registered rather than uploaded again. Do not enable it for a normal first migration. Clear stale media mappings before retrying a source that was previously matched to the wrong object.

## Validate before cutover

- Compare source and target counts by status, category, and date range.
- Open a sample from each template and inspect rich text, links, captions, embeds, galleries, and featured media.
- Confirm target content status; do not accidentally publish drafts.
- Verify old URLs and define redirects to the new frontend.
- Check canonical metadata, structured data, sitemap coverage, and social previews in the new site.
- Trigger cache invalidation and verify the public frontend receives the latest published data.
- Export the migration log and record unresolved exceptions.

After acceptance, revoke or narrow the migration token, remove the plugin if it is no longer required, and preserve the final report with the project handoff.

Continue with [Content](./content.md), [Media](./media.md), [Errors and retries](./errors.md), and [Quotas and usage](./quotas.md).
