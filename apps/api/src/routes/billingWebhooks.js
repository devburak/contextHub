const { Readable } = require('stream');
const billingWebhookService = require('../services/billing/billingWebhookService');
const billingService = require('../services/billing/billingService');

async function billingWebhookRoutes(fastify) {
  if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
    fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    });
  }
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

  fastify.post('/billing/webhooks/iyzico', async (request, reply) => {
    try {
      const accepted = await billingWebhookService.acceptIyzicoEvent(
        request.body || {},
        request.headers['x-iyz-signature-v3']
      );
      if (['pending', 'failed'].includes(accepted.event.status)) {
        setImmediate(() => billingWebhookService.processEvent(accepted.event._id).catch((error) => {
          request.log.error({ err: error, eventId: accepted.event.eventId }, 'iyzico webhook processing failed');
        }));
      }
      return reply.code(202).send({ accepted: true, duplicate: accepted.duplicate });
    } catch (error) {
      request.log.warn({ err: error }, 'Rejected iyzico webhook');
      return reply.code(401).send({ error: 'InvalidWebhook', message: 'Webhook signature or envelope is invalid' });
    }
  });

  const billingAdminUrl = () => String(process.env.ADMIN_URL || 'http://localhost:3100').split(',')[0].trim();

  fastify.post('/billing/callbacks/iyzico', async (request, reply) => {
    const adminUrl = billingAdminUrl();
    const redirectUrl = new URL('/billing', adminUrl);
    try {
      const token = request.body?.token || request.body?.checkoutFormToken;
      if (!token) throw new Error('iyzico checkout token is missing');
      await billingService.completeIyzicoCheckout(token);
      redirectUrl.searchParams.set('checkout', 'success');
      return reply.redirect(303, redirectUrl.toString());
    } catch (error) {
      request.log.warn({ err: error }, 'iyzico checkout callback failed');
      redirectUrl.searchParams.set('checkout', 'failed');
      return reply.redirect(303, redirectUrl.toString());
    }
  });

  const cardUpdateCallback = async (_request, reply) => {
    const adminUrl = billingAdminUrl();
    const redirectUrl = new URL('/billing', adminUrl);
    redirectUrl.searchParams.set('payment_method', 'updated');
    return reply.redirect(303, redirectUrl.toString());
  };
  fastify.post('/billing/callbacks/iyzico/card-update', cardUpdateCallback);
  fastify.get('/billing/callbacks/iyzico/card-update', cardUpdateCallback);
}

module.exports = billingWebhookRoutes;
