# Tenant backup and Google Drive

Tenant backup copies one tenant's database records and uploaded media files from ContextHub Cloud to storage that the customer controls. The destination is either the customer's own **Google Drive** or a private **S3-compatible bucket** (AWS S3, Cloudflare R2, MinIO, and compatible services). Backups run on a daily schedule or on demand, and can be restored from the admin.

## Quick facts

| Question | Answer |
| --- | --- |
| Which plans include it? | Pro, Pro Max, and Enterprise. It is not included in Free. |
| Where can backups be stored? | Your own Google Drive, or your own private S3-compatible bucket. |
| What is backed up? | Tenant database records and uploaded media files. Each group can be turned on or off. |
| How often? | Daily at an hour you choose (UTC), plus manual runs at any time. |
| Full or incremental? | Both. Database and files each use `full` or `incremental` mode. |
| Who can configure it? | The tenant owner, or users with `tenantBackup.configure`. Running and restoring also needs `tenantBackup.run`. |
| Can I restore? | Yes, from the admin, from either a Google Drive or an S3 source. |
| Is it the same as platform disaster recovery? | No. This is a customer-owned copy, separate from ContextHub Cloud's own operational backups. |

## How do I back up a tenant to Google Drive?

1. In the admin, open **Tenant backup** for the tenant you want to protect.
2. Choose **Google Drive** as the destination and select **Connect Google Drive**.
3. Approve the Google consent screen with the account that should own the backups.
4. Back in ContextHub, enable the plan, pick what to include and the daily hour, then save.
5. Use **Test connection**, then **Back up now** for the first full backup.

ContextHub creates a folder named `ContextHub Backups <tenantId>` in that Google account and writes every backup there. The backup page shows a link that opens the folder in Drive.

## What can ContextHub see in my Google Drive?

ContextHub requests only the `drive.file` scope. This scope permits access to files created by the application or explicitly shared with it. The ContextHub backup flow uses its own backup files and folders. It cannot list, read, or change your other Drive documents.

- Each tenant has its own Drive authorization, stored encrypted and never returned by the API.
- Connecting Drive is a separate consent from [Sign in with Google](./google-sign-in.md). Signing in with Google never grants Drive access.
- **Disconnect** revokes the Google authorization and removes it from ContextHub. Existing backup files stay in your Drive.
- Reconnecting the same Google account finds the existing backup folder and continues from it.
- If the same Google account is connected to more than one tenant, disconnecting one tenant can invalidate the others. Reconnect those tenants if a run reports that reconnection is required.
- Backups count against the storage quota of the connected Google account.

## How do I back up to S3-compatible storage?

Choose **S3-compatible storage** and enter the endpoint, bucket, region, prefix, and an access key pair. The bucket must be private, separate, and controlled by you; ContextHub's own media storage cannot be used as a backup destination. Endpoints must use HTTPS and cannot point to private network addresses. Credentials are encrypted at rest and are never shown again after saving. Where the provider supports it, keep AES256 server-side encryption on.

## What is included in a backup?

- **Database:** the tenant's records, written as gzip-compressed NDJSON parts.
- **Files:** the tenant's uploaded media objects, including variants.
- **Manifest and inventory:** every run writes a manifest with SHA-256 checksums so a backup can be verified before it is restored.

`full` mode writes all current records and files. `incremental` mode compares the current state with the last successful run and writes only what changed, including deletions. A run that stops halfway is never used as the starting point for the next incremental run.

## When do backups run?

- **Scheduled:** once a day at the configured hour in UTC.
- **Manual:** **Back up now** starts immediately and continues in the background; the page refreshes its status while a long first backup is in progress.
- **Failures:** a failed scheduled run is retried after a waiting period instead of on every scheduler tick. Manual runs are not blocked by that wait.
- **History:** the admin lists the 25 most recent runs with their mode, record counts, and file counts. Logs never contain credentials or file contents.

Only one backup or restore operation runs for a tenant at a time.

## How does restore work?

Restore is done from **Import from backup** on the Tenant backup page.

1. **Source:** the connected Google Drive account, or an S3 source you save and test.
2. **Restore point:** choose one of the most recent successful backups.
3. **Scope and verification:** choose which data groups and whether media files should be restored. ContextHub performs a dry run that verifies checksums, the tenant boundary, and identifier conflicts.
4. **Apply:** type the exact confirmation phrase to start.

Restore rules:

- The target is always the tenant selected in your session. It cannot be set by a request body.
- Restore does not overwrite existing data. If the selected scope already contains records in the target tenant, the operation is refused.
- Restorable data is CMS data: content and versions, content types, custom field definitions, collections and entries, media and galleries, categories, tags and taxonomies, menus, form definitions, and placement definitions. Form responses are optional and are not selected by default.
- If you select form responses, their answers and saved statuses are restored together. Restore does not resubmit forms or send submission notifications and webhooks.
- The confirmation applies to the verified scope. Changing the selected collections or media files requires a new dry run.
- Drive restore reads the original backups from the connected account; it does not import a ZIP downloaded from Drive.
- **Not restored:** users, roles, memberships, API tokens, billing and subscription data, webhooks, secrets, and analytics or event data. The target tenant keeps its own users and permissions.
- Do not edit content in the target tenant while a restore is running.

## Tenant isolation

- The tenant is taken from the authenticated session or the tenant's own saved plan, never from user input.
- Every exported record is checked against the tenant before it is written.
- A media object is copied only when a media record of the same tenant references it.
- All backup paths are rooted under the tenant identifier; a custom prefix cannot escape that root.

## Limits and notes

- The backup schedule is daily. Hourly or continuous backup is not offered.
- Backup files are a ContextHub-specific format intended for restore into ContextHub. Do not rename or edit them in Drive or in the bucket; restore verifies checksums and rejects changed files.
- Deleting the backup folder or revoking access from your Google account stops future runs until you reconnect.
- Tenant backup is a managed ContextHub Cloud capability and is not part of the community repository. See [Managed and commercial capabilities](./managed-capabilities.md) and [Pricing and plans](./pricing-and-plans.md).
