const { Readable } = require('stream');
const billingWebhookService = require('../services/billing/billingWebhookService');

async function billingWebhookRoutes(fastify) {
  fastify.addHook('preParsing', async (request, reply, payload) => {
    if (!request.url.includes('/billing/webhooks/paddle')) return payload;
    const chunks = [];
    for await (const chunk of payload) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    request.rawBillingBody = Buffer.concat(chunks);
    return Readable.from(request.rawBillingBody);
  });

  fastify.post('/billing/webhooks/paddle', async (request, reply) => {
    try {
      const accepted = await billingWebhookService.acceptPaddleEvent(
        request.rawBillingBody || Buffer.from(JSON.stringify(request.body || {})),
        request.headers['paddle-signature']
      );
      if (['pending', 'failed'].includes(accepted.event.status)) {
        setImmediate(() => billingWebhookService.processEvent(accepted.event._id).catch((error) => {
          request.log.error({ err: error, eventId: accepted.event.eventId }, 'Paddle webhook processing failed');
        }));
      }
      return reply.code(202).send({ accepted: true, duplicate: accepted.duplicate });
    } catch (error) {
      request.log.warn({ err: error }, 'Rejected Paddle webhook');
      return reply.code(401).send({ error: 'InvalidWebhook', message: 'Webhook signature or envelope is invalid' });
    }
  });
}

module.exports = billingWebhookRoutes;
