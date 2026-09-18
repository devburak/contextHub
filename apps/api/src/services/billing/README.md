# iyzico hosted checkout completion and notifications

The payment iframe stays sandboxed. The admin polls the authenticated,
tenant/account-scoped `GET /api/billing/checkout/:sessionId` endpoint while an
embedded checkout is open. A completed server-side session closes the modal,
refreshes billing, and refreshes session entitlements. Frame messages cannot
activate a subscription. Polling stops on completion, failure, expiry, manual
close, tenant change, or unmount.

## Operations payment notifications

After a verified active checkout, the callback persists an internal
`internal.iyzico.checkout.reconcile` job in `BillingEvent` and starts processing
asynchronously. It retrieves the subscription from iyzico, checks its subscription
and plan references, and queues notifications only for `SUCCESS` orders with a
valid amount, currency, and timestamp. `ACTIVE` alone is not proof of a charge.

Signed `subscription.order.success` webhooks and checkout reconciliation use the
same `payment-notification:<orderReferenceCode>` event key. The existing unique
`(provider, eventId)` index and atomic processing claim deduplicate concurrent
normal deliveries. Failed SMTP/reconciliation jobs remain retryable through
the existing billing recovery worker. Delivery metadata is retained with the
minimized payload until the normal retention/redaction cutoff.

SMTP has no exactly-once transaction with MongoDB: a process crash after SMTP
acceptance but before event persistence can still cause duplicate delivery on
recovery. Do not replay processed notification jobs merely because an inbox
has not displayed the message; inspect SMTP acceptance/delivery first.

The recipient remains `HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT`. This is an
operations email, not a customer receipt or legal invoice. No provider charge,
refund, or subscription creation is performed by reconciliation.

## Signature failures

Keep V3 signature verification enabled. Both success and failure subscription
URLs may point to `/api/billing/webhooks/iyzico`. A configured panel URL is not
proof that the signature matches the configured merchant and secret. Rejection
logs contain only the event type and presence flags, never the payload, token,
signature, or secret. Internal job types are rejected at the public ingress.

Check the running process environment against the intended live credentials,
confirm the merchant ID, and compare the notification format with the
[official iyzico webhook documentation](https://docs.iyzico.com/ek-servisler/webhook).
The server-to-server order retrieval follows the
[subscription details API](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/abonelik-islemleri).
Do not open checkout beyond the canary allowlist until a genuine recurring
subscription webhook has passed verification and processing.
