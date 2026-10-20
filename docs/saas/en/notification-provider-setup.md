# Notification provider setup

This page is for ContextHub operators. Customers follow the [Slack](./slack-notifications.md), [Telegram](./telegram-notifications.md) or [WhatsApp](./whatsapp-notifications.md) connection guide. All channels are available on Free and paid plans; tenant management permission still applies.

## Who configures what?

| Channel | ContextHub operator, once per deployment | Each customer |
| --- | --- | --- |
| Slack | Shared Slack app, Incoming Webhooks, OAuth credentials, exact HTTPS redirect, distribution | Authorize their own workspace and choose a channel. |
| Telegram | Credential encryption and outbound HTTPS access to Telegram | Create their own bot, prepare the destination, enter bot token and chat ID. |
| WhatsApp | Credential encryption and a supported Graph API version | Prepare their own Business Cloud API sender, token, recipient and approved template. |
| Failure emails | Existing tenant/global SMTP service | No extra SMTP account is required to connect a channel. |

## Existing encryption keys and SMTP

The current implementation uses `WEBHOOK_CREDENTIALS_KEY`: base64 encoded random **32 bytes**. Generate it once in your secret manager or a private terminal:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the result as `WEBHOOK_CREDENTIALS_KEY` in the API runtime and every independent dispatcher/cron runtime. Do not place its value in documentation, source control or a customer form. Keep it stable across releases and backups. Replacing it makes existing integration credentials unreadable; a key migration/reconnection is required.

`SMTP_SECRET_KEY` protects tenant SMTP passwords; `EXTENSION_SECRET_KEY` protects extension secrets; `BILLING_PII_ENCRYPTION_KEY` protects billing data. None is automatically substituted for `WEBHOOK_CREDENTIALS_KEY`. Existing SMTP setup does not establish that this new key is present.

Failure alerts call the existing mail service, using tenant SMTP where configured and global SMTP otherwise. Reuse a working setup; do not configure another mail server for these integrations. Email is used for failure alerts, not Slack/Telegram/WhatsApp delivery. A live runtime check must inspect only whether required settings are present, without printing secret values.

## Slack operator setup

1. Create one ContextHub Slack app in the [Slack app dashboard](https://api.slack.com/apps).
2. Enable **Incoming Webhooks**.
3. Under **OAuth & Permissions**, add the bot scope `incoming-webhook` and register `https://ctxhub.net/varliklar/webhooks` as a redirect URL when `ctxhub.net` is your admin host. Use your actual HTTPS admin host for another deployment.
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and the identical `SLACK_REDIRECT_URI` in the API runtime. The redirect is the authenticated admin page, not an API callback URL.
5. Enable the appropriate distribution mode so another workspace can authorize the app. Use controlled pilot installs first. For commercial distribution to all customers, complete Slack Marketplace submission/review under [Slack's commercial distribution requirements](https://docs.slack.dev/changelog/2025/05/29/tos-updates/).
6. Test installation from a separate workspace and a permitted private channel. Confirm the selected channel is stored and receives a test event.

Only `incoming-webhook` is requested; the implementation posts through the webhook returned by OAuth. It does not require message-history scopes, a Slack Signing Secret, an Events API URL or a separate customer-created developer app. Consult [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/) and [distribution](https://docs.slack.dev/app-management/distribution/) for app settings.

## Telegram and WhatsApp operator settings

Telegram requires no shared bot, OAuth client ID or Telegram app secret on the server. It uses customer-provided bot credentials and outbound access to `api.telegram.org`.

Set `WHATSAPP_GRAPH_API_VERSION` to a Graph version supported by your customer's Meta app. The current direct-credential flow does not use a central Meta app ID/secret or Embedded Signup configuration. Customers supply their own credentials. Outbound requests go to `graph.facebook.com`.

Do not copy a version from an old example without checking the customer's supported version. See [Meta's official Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

## Release and acceptance

Deploy the API and matching admin feature before advertising customer availability. The docs catalog can include these guides while provider setup is being prepared; guide availability alone does not establish that a live deployment is configured.

Normal API startup verifies required outbox indexes and starts the webhook worker. If `WEBHOOK_SCHEDULER_ENABLED=false`, run an external worker/cron instead. Configure the same encryption key in every sending runtime. PM2 process environments can override `.env`; check the running process after a managed reload.

For each channel, connect a customer-owned destination, send a test, trigger a selected real event, and inspect delivery history. Test HTTP 429/retry and endpoint recovery in a controlled test receiver. Verify that provider credentials never appear in API responses or log previews. See [webhook operations](./webhooks.md) for signatures, retry limits and automatic stopping.
