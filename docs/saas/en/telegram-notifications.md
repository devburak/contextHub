# Telegram notifications

Connect a bot you own to a Telegram private chat, group or channel. All ContextHub plans support this integration. You need permission to manage the selected tenant. ContextHub uses a bot token and chat ID; signing in to your personal Telegram account is not part of this flow.

## Create and prepare your bot

1. Open the official [BotFather](https://t.me/BotFather) in Telegram and use `/newbot`.
2. Choose the bot's name and username. Keep the token returned by BotFather private.
3. For a private chat, open your new bot and send `/start`.
4. For a group, add your bot and send a command addressed to it, such as `/start@your_bot_username`. For a channel, add the bot as an administrator with permission to post messages.

These are Telegram's bot setup steps; see the [official bot tutorial](https://core.telegram.org/bots/tutorial).

## Find the destination chat ID

Use the chat's numeric ID, including its minus sign for groups, or the public destination's `@username`. Do not use the bot's own username as a replacement for a private user's chat ID.

For a new bot with no existing webhook or polling application, send it a message/command and run this one-time Python 3 helper locally. It asks for the token without putting it in your shell history and prints only chat IDs and names:

```python
import getpass
import json
import urllib.request

token = getpass.getpass("Telegram bot token: ").strip()
request = urllib.request.Request(
    "https://api.telegram.org/bot" + token + "/getUpdates",
    data=b"timeout=0",
)
try:
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.load(response)
except Exception:
    raise SystemExit("Could not read updates; check bot setup and connectivity.")

chats = {}
for update in result.get("result", []):
    message = update.get("message") or update.get("channel_post") or {}
    chat = message.get("chat", {})
    if "id" in chat:
        chats[chat["id"]] = chat.get("title") or chat.get("username") or chat.get("first_name", "")
for chat_id, name in chats.items():
    print(chat_id, name)
```

If the result is empty, send a fresh message to the bot and try again. If the bot already belongs to another application, obtain the chat ID from that application's administrator. Do not remove its webhook or run a competing poller: [`getUpdates` cannot be used while an outgoing webhook is configured](https://core.telegram.org/bots/faq#how-do-i-get-updates).

## Connect in ContextHub

1. Select the tenant, open **Assets → Webhooks**, and create a subscription.
2. Choose **Telegram** and enter **Bot token** and **Chat ID**.
3. Select events and save. Leave optional filters empty for the first test.
4. Click **Send test**. Check the destination and **Delivery history**.

Messages contain an event summary, not submitted form answers or the full content document. A successful delivery means Telegram accepted the API request; read receipts are not tracked.

## Update credentials or troubleshoot

To change the destination/token, edit the subscription and re-enter both fields. Leaving the token empty preserves the existing connection. Deleting the subscription stops ContextHub deliveries but does not delete or revoke the Telegram bot.

| Problem | Check |
| --- | --- |
| Unauthorized | Token was copied correctly and has not been revoked. |
| Chat not found / forbidden | Correct chat ID; `/start` was sent for a private chat; bot belongs to the group/channel and can post. |
| HTTP 429 / rate limit | Wait for the retry time shown in the log; ContextHub respects Telegram's retry delay. |
| Test works, selected events do not | Event selection and [subscription filters](./webhooks.md). |
| Credentials cannot be saved | Ask the operator to check [encryption setup](./notification-provider-setup.md). |

See [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage) for the provider API contract. No shared ContextHub Telegram bot or customer-side webhook URL is required.

## Team and personal destinations

When connecting a chat provider, choose **Team channel** or **Personal connection**. Both require the current tenant's management permission. Team connections can be managed by authorized tenant administrators; personal connections and their delivery history are visible only to their creator. Visibility is fixed when the connection is created; create a new connection to change it. Existing subscriptions remain team connections.

A personal connection receives the selected events from its tenant; it does not mean only events triggered by that user. The worker checks the owner's active account, active tenant membership and current management permission before every send, including retries and resends. Revoked access stops delivery. Personal connection failure emails go only to its owner.

Delivery uses the saved destination: the channel selected during Slack authorization, the Telegram bot's configured chat ID, or the configured WhatsApp recipient number. No tenant-wide or platform-wide fallback recipient is used. A personal connection does not make an external group private: Slack/Telegram group administrators control membership. Choose a private channel or a direct chat and verify its members before enabling notifications. Telegram chat IDs must identify the intended chat; permission to post with a bot token alone does not prove ownership of that chat. WhatsApp recipients must agree to receive notifications.

Tenant events, subscriptions and outbox payloads must have matching stable tenant IDs. Missing or mismatched IDs are blocked before any external request. Tenant slugs do not expand delivery scope. Self-hosted operators with legacy slug-based subscriptions must migrate them to stable tenant IDs before enabling delivery; encrypted provider credentials require re-encryption with the new tenant ID. Do not interpret a 24-character hexadecimal identifier as a slug.
