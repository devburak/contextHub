# WhatsApp notifications

Send event summaries through your own WhatsApp Business Cloud API account. The ContextHub integration is available on Free and paid plans; Meta's account requirements and messaging charges remain separate. This is a Business API integration, not a personal WhatsApp login or an Embedded Signup flow.

## Prepare your Business account

You need a Meta business portfolio, a WhatsApp Business Account and a sender phone number enabled for Cloud API. Follow [Meta's official Cloud API getting-started collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

Obtain these settings from your own Meta app/WhatsApp Manager:

| ContextHub field | What to enter |
| --- | --- |
| Access token | A valid token authorized to send messages for the sender account; production should use an appropriately scoped system-user token rather than a temporary dashboard token. |
| Sender phone number ID | The numeric Cloud API **phone number ID**, not the displayed phone number or Business Account ID. |
| Recipient number | A recipient who has agreed to receive these messages; include the country code and digits only, such as `905551234567`. |
| Approved template name | The exact name of the three-parameter template described below. |
| Template language | The exact approved language code, such as `tr` or `en_US`. |

Message sending uses `whatsapp_business_messaging`. Account/template administration can also require `whatsapp_business_management`; assign the appropriate business assets to the token's system user. The [official collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api) describes token types and permissions. Token expiry/revocation is managed in Meta; ContextHub does not refresh tokens automatically.

## Create a compatible message template

In WhatsApp Manager, create a text template, for example `contexthub_event`. Use exactly three positional body variables in this order:

| Variable | Value supplied by ContextHub |
| --- | --- |
| `{{1}}` | Event type, such as `content.published` |
| `{{2}}` | Event ID |
| `{{3}}` | Tenant ID |

Example English body to submit for approval:

```text
ContextHub notification
Event: {{1}}
Event ID: {{2}}
Tenant: {{3}}
Open your ContextHub panel for details.
```

Choose the category appropriate to your actual use and provide sample values in Meta's form. Wait for approval of the exact language you will enter in ContextHub. Approval is Meta's decision. The current adapter sends only the three body text parameters: do not choose a template requiring media/header/button parameters or named variables. See [Meta's template message request](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text).

## Connect and test

1. Select the tenant in ContextHub and open **Assets → Webhooks**.
2. Create a subscription with **WhatsApp Business** as its channel.
3. Enter the five fields above, select events and save. Leave optional filters empty for the first test.
4. Click **Send test** and inspect the destination plus **Delivery history**.
5. Publish content matching your selected events to check the normal flow.

Tests send a `webhook.test` event through the same approved template. Notifications contain identifiers and event type, not full content or submitted form answers. A successful ContextHub delivery means Meta accepted the API request; final handset delivery/read receipts are not tracked by this integration.

## Troubleshooting and changes

| Problem | Action |
| --- | --- |
| Token rejected | Check expiry, permissions and access to the sender assets in Meta. |
| Sender rejected | Use the phone number ID, not the telephone number or WABA ID. |
| Template/language/parameter error | Verify approval, exact name and language, and exactly three positional body text parameters. |
| Recipient rejected | Check country code, recipient consent and any test-account recipient restrictions in Meta. |
| Graph API version is not configured | Ask the operator to complete [provider setup](./notification-provider-setup.md). |
| Subscription automatically stopped | Resolve the provider error, reactivate the subscription and resend the relevant job from history. |

To change credentials or the destination, edit and re-enter all five fields, including the token. Leaving the token empty preserves the existing connection. Deleting the subscription stops ContextHub messages; revoke unused tokens separately in Meta. Shared [filters, retries and delivery operations](./webhooks.md) also apply.

## Team and personal destinations

When connecting a chat provider, choose **Team channel** or **Personal connection**. Both require the current tenant's management permission. Team connections can be managed by authorized tenant administrators; personal connections and their delivery history are visible only to their creator. Visibility is fixed when the connection is created; create a new connection to change it. Existing subscriptions remain team connections.

A personal connection receives the selected events from its tenant; it does not mean only events triggered by that user. The worker checks the owner's active account, active tenant membership and current management permission before every send, including retries and resends. Revoked access stops delivery. Personal connection failure emails go only to its owner.

Delivery uses the saved destination: the channel selected during Slack authorization, the Telegram bot's configured chat ID, or the configured WhatsApp recipient number. No tenant-wide or platform-wide fallback recipient is used. A personal connection does not make an external group private: Slack/Telegram group administrators control membership. Choose a private channel or a direct chat and verify its members before enabling notifications. Telegram chat IDs must identify the intended chat; permission to post with a bot token alone does not prove ownership of that chat. WhatsApp recipients must agree to receive notifications.

Tenant events, subscriptions and outbox payloads must have matching stable tenant IDs. Missing or mismatched IDs are blocked before any external request. Tenant slugs do not expand delivery scope. Self-hosted operators with legacy slug-based subscriptions must migrate them to stable tenant IDs before enabling delivery; encrypted provider credentials require re-encryption with the new tenant ID. Do not interpret a 24-character hexadecimal identifier as a slug.
