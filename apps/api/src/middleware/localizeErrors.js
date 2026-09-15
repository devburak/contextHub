'use strict';

/**
 * Hata yanıtlarını tek noktadan yerelleştirir.
 *
 * Route'lar bugün `reply.code(4xx).send({ error: 'SomeCode', message: error.message })`
 * kalıbını kullanıyor — 120'den fazla çağrı noktası. Her birine tek tek dokunmak yerine
 * bir `onSend` hook'u yanıtı çıkışta yakalayıp `message` alanını çözülen dile göre
 * katalogdan dolduruyor.
 *
 * Davranış:
 *   - Yalnızca statusCode >= 400 olan JSON yanıtlara dokunur.
 *   - Yalnızca `error` alanı katalogda **bulunan** bir kod ise devreye girer;
 *     Fastify'ın kendi şema hataları (`error: 'Bad Request'`) olduğu gibi geçer.
 *   - Özgün geliştirici mesajı production dışında `detail` alanında korunur.
 *     Production'da düşürülür — iç hata metinleri istemciye sızmamalı.
 */

const { resolveLocale, translateErrorCode, hasErrorCode } = require('../lib/i18n');

function isJsonContentType(reply) {
  const contentType = reply.getHeader('content-type');
  return typeof contentType === 'string' && contentType.includes('application/json');
}

function createErrorLocalizationHook({ exposeDetail = process.env.NODE_ENV !== 'production' } = {}) {
  return async function localizeErrorPayload(request, reply, payload) {
    if (reply.statusCode < 400 || typeof payload !== 'string' || !isJsonContentType(reply)) {
      return payload;
    }

    let body;
    try {
      body = JSON.parse(payload);
    } catch {
      return payload;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body) || !hasErrorCode(body.error)) {
      return payload;
    }

    const locale = resolveLocale(request);
    const translated = translateErrorCode(body.error, locale);
    if (!translated) {
      return payload;
    }

    const originalMessage = typeof body.message === 'string' ? body.message : null;
    body.message = translated;

    if (exposeDetail && originalMessage && originalMessage !== translated) {
      body.detail = originalMessage;
    } else {
      delete body.detail;
    }

    const next = JSON.stringify(body);
    reply.header('content-length', Buffer.byteLength(next));
    reply.header('vary', [reply.getHeader('vary'), 'Accept-Language'].filter(Boolean).join(', '));
    return next;
  };
}

module.exports = { createErrorLocalizationHook };
