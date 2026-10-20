# Slack notifications

Connect your own Slack workspace and receive ContextHub event notifications in a channel. This integration is available on Free and paid plans. You need permission to manage the current tenant and permission to install the ContextHub app in the Slack workspace.

## Connect a workspace

1. Sign in to ContextHub and select the tenant whose events you want to receive.
2. Open **Assets → Webhooks** and create a subscription.
3. Choose **Slack** as the notification channel.
4. Select events, for example `content.published`. Leave optional filters empty for the first test.
5. Click **Connect Slack**. Slack opens its authorization page.
6. Check the workspace, select the destination channel, and approve the app. Your workspace administrator may need to approve installation.
7. Return to ContextHub. The new subscription shows the connected channel.
8. Click **Send test** and check both Slack and **Delivery history**.

You do not create a Slack developer app or paste a webhook URL. ContextHub's operator configures the shared app once; each customer authorizes their own workspace/channel. Slack provides the channel picker through its [`incoming-webhook` scope](https://docs.slack.dev/reference/scopes/incoming-webhook).

## What arrives in Slack

Messages contain the event type, tenant ID, event ID and event time. Form answers and full content documents are not included. A notification looks like:

```text
ContextHub · content.published
Tenant: <your-tenant-id>
Event: <event-id>
<event-time>
```

Event filters determine which notifications are queued. A locale filter only matches events that carry locale information. See [filters and delivery behavior](./webhooks.md).

## Change or disconnect

Edit the subscription to change its events, filters or active status. To connect a different workspace/channel, create a new Slack subscription and remove the old one after testing. Removing a ContextHub subscription stops its deliveries; it does not uninstall the Slack app from your workspace. Revoke the app separately in Slack if needed.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Slack is not configured | Ask the ContextHub operator to complete [provider setup](./notification-provider-setup.md). |
| Installation requires approval | Ask the destination workspace administrator to approve the app. |
| The connection expired | Start **Connect Slack** again. Authorization must finish within ten minutes. |
| The wrong tenant is active on return | ContextHub tries to restore the tenant that started the connection. If switching fails, select that tenant and reload the callback page. |
| Test works, but content notifications do not arrive | Check selected events and filters; empty filters are the easiest starting point. |
| Subscription stopped automatically | Check delivery history, fix Slack access/channel problems, reactivate the subscription and resend the affected delivery. |

An accepted delivery means Slack accepted the request; ContextHub does not track whether a channel member read the message. Failed requests follow the shared retry policy. See [Slack's OAuth flow](https://docs.slack.dev/authentication/installing-with-oauth/) for provider details.
