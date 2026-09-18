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

## Immediate Pro → Pro Max upgrades (gated)

`BILLING_PLAN_CHANGES_ENABLED` defaults to **false**. It additionally requires
account billing, iyzico, and the existing `BILLING_CHECKOUT_TENANT_IDS` allowlist.
Do not enable broadly before the canary checklist below passes. No production
flag, price, subscription, refund, or card is changed by deploying this code.

Only active, paid TRY Pro → Pro Max within the **same** monthly/yearly interval
is supported. The server retrieves the actual paid order and both provider
plans, checking amount, currency, product, status, and interval. Canceled,
trialing, past-due, cross-currency/interval, downgrade, and Enterprise cases
cannot collect a difference. There must be at least two hours until renewal.

The immutable five-minute quote is `(new price - paid period price) × remaining
milliseconds / period milliseconds`, rounded once, half up to a kuruş. Prices
are VAT-inclusive. The quote and actor's explicit acceptance are stored in
`BillingPlanChange`; it has **no TTL**. Its unique partial `tenantId` index
allows only one active financial intent. These financial indexes are part of
mandatory additive startup index verification even when general auto-indexing
is disabled. Startup must fail rather than accept payments without them.

- `POST /api/billing/plan-changes/quote` accepts only a target price ID.
- `POST /api/billing/plan-changes/:changeId/confirm` requires `accepted: true`.
- `GET /api/billing/plan-changes/:changeId` is tenant/account scoped. All three
  require `billing:manage`; prices and amounts are never client-authoritative.
- Accepted quotes initialize an ordinary one-off Checkout Form (`PRODUCT`, one
  installment), **not** another subscription checkout. Repeated confirmation
  resumes the same encrypted form while valid. Secrets are not serialized.
- The existing callback dispatches plan-change tokens separately. The browser
  only polls status; a redirect or unsigned frame message never grants access.
- Server retrieval verifies response signature, token, conversation/basket,
  exact listed/paid amount, currency, and payment ID before recording payment.
- Verified payment applies Pro Max immediately with `trackActivation:false`;
  tenant usage/billing anchors are preserved. The existing recurring agreement
  is upgraded via **NEXT_PERIOD**, `useTrial:false`, `resetRecurrenceCount:false`.
  NOW is never used, avoiding a second full-period charge.
- The provider's replacement reference is recorded durably. Late predecessor
  events cannot reopen/change the replacement. Renewal events verify their
  actual order and update period dates. Cancellation checks both references.
- Operations notification is deduplicated by the one-off payment ID and starts
  immediately after completion, with the existing queue as fallback. It is not
  a customer receipt or invoice.

### Recovery / operator intervention

Startup and minute recovery plus authenticated status polling reconcile saved
tokens; provider reads are throttled per intent. A durable `upgrade_requested`
claim precedes the non-idempotent provider write. An interrupted/ambiguous
initialize or upgrade is **never automatically replayed**. Expired forms with
unconfirmed payment also remain locked; a card decline alone does not prove a
checkout can no longer succeed. This intentionally trades automated retry for
protection against two payable forms or duplicate provider changes.

`needs_review` keeps the financial intent active, shows the owner a “do not pay
again” notice, and emits a log containing only the intent ID and paid flag.
After payment is verified, a scheduling error does not erase payment evidence
or withdraw the already-unlocked plan. Operator reconciliation is required
before renewal; monitor this state during canary operation.

For reconciliation: inspect the intent and provider payment/old+new agreement
**read-only first**. Match payment ID, amount, currency, plan, reference chain,
and renewal date. Never reset a paid record to `quoted`, remove its lock, create
another checkout, replay `/upgrade`, or auto-refund from an ambiguous response.
If iyzico accepted the upgrade but persistence failed, an operator must verify
and record its replacement reference before resuming the local `scheduled`
step. Provider writes/refunds and manual state repair require a separately
reviewed operational action; there is deliberately no public repair endpoint.

### Canary release checklist

1. Run billing/backend/UI tests and hosted build; ensure indexes and encryption
   key exist. Verify desktop/mobile dialog layout and keyboard focus.
2. Fix/verify genuine recurring V3 webhook acceptance; never bypass signatures.
3. Use an active paid canary subscription. A refunded/canceled provider
   subscription is not eligible even when the local tenant still says Pro.
4. Enable only for the canary; owner accepts the displayed quote and performs
   the one-off payment. Do not initiate a real charge as a deployment step.
5. Verify one difference charge, immediate Pro Max access, unchanged usage
   cycle/renewal date, correct pending/new recurring plan, modal completion,
   and notification. Confirm old and new references in the merchant panel.
6. Validate recurring renewal and cancellation of the reference chain before
   a broader rollout. Downgrades, interval migration, customer receipts, and
   Enterprise contract signing are separate flows, not implied by this release.

Provider contracts: [upgrade API](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/abonelik-islemleri),
[plan details](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/odeme-plani),
[one-off checkout](https://docs.iyzico.com/odeme-metotlari/odeme-formu/cf-entegrasyonu/cf-baslatma),
[response signature](https://docs.iyzico.com/ek-servisler/imza-yanitinin-dogrulanmasi).
