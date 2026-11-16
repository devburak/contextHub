// Additive indexes required by the API before it starts serving requests.
// These are also used by the models so deployment and schema definitions agree.
module.exports = {
  ApiToken: [{ hash: 1 }],
  Membership: [{ userId: 1, status: 1 }],
  AuthMfaChallenge: [{ expiresAt: 1 }],
  WebhookOutbox: [
    { dedupeKey: 1 },
    { tenantId: 1, updatedAt: -1, createdAt: -1 },
    { status: 1, updatedAt: 1 },
  ],
  BillingPlanChange: [
    { tenantId: 1 },
    { tokenHash: 1 },
    { externalPaymentId: 1 },
    { status: 1, updatedAt: 1 },
  ],
  Content: [
    { tenantId: 1, status: 1, publishedAt: -1, _id: -1 },
    { tenantId: 1, publishedAt: -1, _id: -1 },
    { tenantId: 1, updatedAt: -1 },
    { status: 1, publishAt: 1 },
  ],
  CollectionEntry: [
    { tenantId: 1, collectionKey: 1, status: 1, createdAt: -1, _id: 1 },
  ],
  Gallery: [
    { tenantId: 1, linkedContentIds: 1, updatedAt: -1 },
  ],
  Media: [
    { tenantId: 1, updatedAt: -1 },
  ],
  User: [
    { resetPasswordToken: 1 },
    { emailVerificationToken: 1 },
  ],
};
