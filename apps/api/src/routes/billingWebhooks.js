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
    const bodyLimit = request.routeOptions.bodyLimit ?? fastify.initialConfig.bodyLimit;
    let length = 0;
    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > bodyLimit) {
        const error = new Error('Request body is too large');
        error.statusCode = 413;
        error.code = 'FST_ERR_CTP_BODY_TOO_LARGE';
        throw error;
      }
      chunks.push(buffer);
    }
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
      request.log.warn({
        err: error,
        eventType: String(request.body?.iyziEventType || '').slice(0, 100),
        hasV3Signature: Boolean(request.headers['x-iyz-signature-v3']),
        hasSubscriptionReference: Boolean(request.body?.subscriptionReferenceCode),
      }, 'Rejected iyzico webhook');
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
      const result = await billingService.completeIyzicoCheckout(token);
      redirectUrl.searchParams.set('checkout', result.planChange
        ? (result.pending ? 'plan_change_pending' : 'plan_change_success')
        : result.reviewCheckout ? 'review_success' : 'success');
      return reply.redirect(redirectUrl.toString(), 303);
    } catch (error) {
      request.log.warn({ err: error }, 'iyzico checkout callback failed');
      redirectUrl.searchParams.set('checkout', 'failed');
      return reply.redirect(redirectUrl.toString(), 303);
    }
  });

  const cardUpdateCallback = async (_request, reply) => {
    const adminUrl = billingAdminUrl();
    const redirectUrl = new URL('/billing', adminUrl);
    redirectUrl.searchParams.set('payment_method', 'updated');
    return reply.redirect(redirectUrl.toString(), 303);
  };
  fastify.post('/billing/callbacks/iyzico/card-update', cardUpdateCallback);
  fastify.get('/billing/callbacks/iyzico/card-update', cardUpdateCallback);
}

module.exports = billingWebhookRoutes;
