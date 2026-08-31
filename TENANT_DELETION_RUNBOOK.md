# Tenant and account deletion lifecycle

## Account deletion

- The user must re-enter their password and type their complete e-mail address.
- A user who is the sole active owner of an active tenant cannot delete the account.
- Where another active owner exists, `Account.ownerUserId` and the billing e-mail are transferred automatically.
- Memberships are revoked. The `User` record is retained as an anonymized tombstone so audit and financial references do not dangle.
- Contract/declaration acceptance gets an actor snapshot before personal fields are anonymized.

## Tenant soft delete and restore

- Only an active owner can delete or restore a tenant. Both operations require password and exact slug confirmation.
- Delete immediately changes the tenant status to `deletion_pending`, then `deleted`. API/session access, scheduled content, consumers, webhooks and API tokens stop processing that tenant.
- Content, media metadata, plugin settings and plugin secrets remain during the restore window.
- Subscription cancellation is requested immediately by default. Provider errors are recorded and retried.
- Restore is allowed until `purgeAfter`. Revoked API tokens stay revoked and must be created again.
- If subscription cancellation was requested, restore returns the tenant on the free plan. Stored paid-plugin configuration remains available for a later paid reactivation.

## Physical purge

`TENANT_DELETION_RETENTION_DAYS` defaults to 30. Run one scheduler periodically:

```sh
pnpm cron:tenant-purge
```

Every run first reconciles suspended edge configuration, revoked token keys and pending immediate subscription cancellations. It then purges due tenants unless `legalHold=true`, billing is still open, or an invoice is `draft`, `open` or `past_due`.

The purge removes tenant-scoped operational MongoDB data, media objects and plugin settings/secrets. Tenant, account, subscription, invoice and activity-log tombstones remain for finance and audit retention. Customer backup objects use their own backup-retention policy and are not deleted by this job.

Semantic Vectorize/D1 data is inaccessible as soon as the tenant is deleted, but its physical deletion must be handled by the semantic indexer's tenant-purge operation before this lifecycle can be treated as a complete erasure workflow.

Use an external single-runner scheduler. Do not start this command independently in every API replica.
