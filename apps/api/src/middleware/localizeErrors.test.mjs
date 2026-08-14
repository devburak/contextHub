import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createErrorLocalizationHook } = require('./localizeErrors.js');

function makeReply({ statusCode = 400, contentType = 'application/json; charset=utf-8' } = {}) {
  const headers = { 'content-type': contentType };
  return {
    statusCode,
    getHeader: (name) => headers[name.toLowerCase()],
    header: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    headers,
  };
}

const jsonRequest = (headers = {}) => ({ headers });

describe('error localisation hook', () => {
  it('replaces the message with the Turkish catalogue entry by default', async () => {
    const hook = createErrorLocalizationHook({ exposeDetail: false });
    const reply = makeReply();
    const payload = JSON.stringify({ error: 'ContentNotFound', message: 'content missing in db' });

    const result = JSON.parse(await hook(jsonRequest(), reply, payload));

    expect(result.error).toBe('ContentNotFound');
    expect(result.message).toBe('İçerik bulunamadı.');
    expect(result.detail).toBeUndefined();
  });

  it('honours Accept-Language', async () => {
    const hook = createErrorLocalizationHook({ exposeDetail: false });
    const reply = makeReply();
    const payload = JSON.stringify({ error: 'ContentNotFound', message: 'x' });

    const result = JSON.parse(
      await hook(jsonRequest({ 'accept-language': 'en-US,en;q=0.9' }), reply, payload)
    );

    expect(result.message).toBe('Content not found.');
  });

  it('keeps the developer message as detail when detail is exposed', async () => {
    const hook = createErrorLocalizationHook({ exposeDetail: true });
    const reply = makeReply();
    const payload = JSON.stringify({ error: 'ValidationFailed', message: 'slug must be unique' });

    const result = JSON.parse(await hook(jsonRequest(), reply, payload));

    expect(result.detail).toBe('slug must be unique');
  });

  it('does not leak the developer message when detail is hidden', async () => {
    const hook = createErrorLocalizationHook({ exposeDetail: false });
    const reply = makeReply();
    const payload = JSON.stringify({
      error: 'InternalServerError',
      message: 'MongoServerError: connection refused at 10.0.0.5:27017',
    });

    const result = JSON.parse(await hook(jsonRequest(), reply, payload));

    expect(result.detail).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('10.0.0.5');
  });

  it('leaves successful responses untouched', async () => {
    const hook = createErrorLocalizationHook();
    const reply = makeReply({ statusCode: 200 });
    const payload = JSON.stringify({ error: 'ContentNotFound' });

    expect(await hook(jsonRequest(), reply, payload)).toBe(payload);
  });

  it('leaves unknown error codes untouched so Fastify schema errors survive', async () => {
    const hook = createErrorLocalizationHook();
    const reply = makeReply();
    const payload = JSON.stringify({
      error: 'Bad Request',
      message: "body must have required property 'email'",
    });

    expect(await hook(jsonRequest(), reply, payload)).toBe(payload);
  });

  it('leaves non-JSON payloads untouched', async () => {
    const hook = createErrorLocalizationHook();
    const reply = makeReply({ contentType: 'text/plain' });

    expect(await hook(jsonRequest(), reply, 'ContentNotFound')).toBe('ContentNotFound');
  });

  it('survives malformed JSON payloads', async () => {
    const hook = createErrorLocalizationHook();
    const reply = makeReply();

    expect(await hook(jsonRequest(), reply, '{not json')).toBe('{not json');
  });

  it('recalculates content-length and marks the response as varying on Accept-Language', async () => {
    const hook = createErrorLocalizationHook({ exposeDetail: false });
    const reply = makeReply();
    const payload = JSON.stringify({ error: 'ContentNotFound', message: 'x' });

    const result = await hook(jsonRequest(), reply, payload);

    expect(reply.headers['content-length']).toBe(Buffer.byteLength(result));
    expect(reply.headers.vary).toContain('Accept-Language');
  });
});
