// Additive indexes required by the API before it starts serving requests.
// These are also used by the models so deployment and schema definitions agree.
module.exports = {
  BillingPlanChange: [
    { tenantId: 1 },
    { tokenHash: 1 },
    { externalPaymentId: 1 },
    { status: 1, updatedAt: 1 },
  ],
  Content: [
    { tenantId: 1, status: 1, publishedAt: -1, _id: -1 },
    { tenantId: 1, publishedAt: -1, _id: -1 },
  ],
  Gallery: [
    { tenantId: 1, linkedContentIds: 1, updatedAt: -1 },
  ],
};
