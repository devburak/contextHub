const webhookService = require('../services/webhookService');
const { tenantContext, authenticate: authenticateBase, requirePermission } = require('../middleware/auth');
const { rbac } = require('@contexthub/common');

const { PERMISSIONS } = rbac;

const slackOAuth = require('../services/webhookSlackOAuth');

async function authenticate(request, reply) {
  await authenticateBase(request, reply);
  if (reply.sent) return;
  if (request.params?.tenantId && String(request.params.tenantId) !== String(request.tenantId)) {
    return reply.code(403).send({ error: 'Tenant mismatch' });
  }
}

const filtersSchema = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(['locales', 'environments', 'collectionKeys'].map((key) => [key, {
    type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 100 }
  }]))
};
const subscriptionProperties = {
  payloadMode: { type: 'string', enum: ['event', 'ids'] }, filters: filtersSchema
};
const integrationSchema = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(['botToken', 'chatId', 'accessToken', 'phoneNumberId', 'recipient', 'templateName', 'language'].map((key) => [key, { type: 'string', maxLength: 4096 }]))
};
const deliverySchema = {
  type: 'object', properties: {
    id: { type: 'string', nullable: true }, webhookId: { type: 'string', nullable: true },
    eventId: { type: 'string', nullable: true }, type: { type: 'string' }, status: { type: 'string' },
    createdAt: { type: 'string', nullable: true }, updatedAt: { type: 'string', nullable: true },
    lastError: { type: 'string', nullable: true }, errorType: { type: 'string', nullable: true },
    lastHttpStatus: { type: 'number', nullable: true }, lastDurationMs: { type: 'number', nullable: true },
    nextRetryAt: { type: 'string', nullable: true }, retryCount: { type: 'number' },
    attempts: { type: 'array', items: { type: 'object', additionalProperties: true } }
  }
};

const webhookResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    tenantId: { type: 'string' },
    url: { type: 'string' },
    isActive: { type: 'boolean' },
    events: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', nullable: true },
    updatedAt: { type: 'string', nullable: true },
    hasSecret: { type: 'boolean' },
    provider: { type: 'string' }, integration: { type: 'object', additionalProperties: true },
    ...subscriptionProperties,
    consecutiveFailures: { type: 'number' }, disabledAt: { type: 'string', nullable: true },
    notificationPending: { type: 'boolean' }, notificationSentAt: { type: 'string', nullable: true }
  }
};

function injectTenantParam(request, reply, done) {
  if (request.params && request.params.tenantId) {
    request.query = request.query || {};
    request.query.tenantId = request.params.tenantId;
  }
  done();
}

function handleServiceError(reply, error) {
  const message = error?.message || 'Unexpected error';
  const isNotFound = message.toLowerCase().includes('not found');
  const statusCode = isNotFound ? 404 : 400;
  return reply.code(statusCode).send({ error: message });
}

async function webhookRoutes(fastify) {
  fastify.addHook('preHandler', injectTenantParam);
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/admin/domain-event-types', {
    preHandler: [
      authenticate,
      requirePermission([PERMISSIONS.TENANTS_VIEW, PERMISSIONS.TENANTS_MANAGE], { mode: 'any' })
    ],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async function domainEventTypesHandler() {
    return { types: webhookService.getDomainEventTypes() };
  });

  fastify.get('/admin/tenants/:tenantId/webhooks', {
    preHandler: [
      authenticate,
      requirePermission([PERMISSIONS.TENANTS_VIEW, PERMISSIONS.TENANTS_MANAGE], { mode: 'any' })
    ],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            webhooks: {
              type: 'array',
              items: webhookResponseSchema
            },
            availableEventTypes: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async function listWebhooksHandler(request) {
    const { tenantId } = request.params;
    const webhooks = await webhookService.listWebhooks(tenantId);
    return {
      webhooks,
      availableEventTypes: webhookService.getDomainEventTypes()
    };
  });

  fastify.get('/admin/tenants/:tenantId/webhooks/queue', {
    preHandler: [
      authenticate,
      requirePermission([PERMISSIONS.TENANTS_VIEW, PERMISSIONS.TENANTS_MANAGE], { mode: 'any' })
    ],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            domainEvents: {
              type: 'object',
              properties: {
                totalPending: { type: 'number' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', nullable: true },
                      type: { type: 'string' },
                      status: { type: 'string' },
                      occurredAt: { type: 'string', nullable: true },
                      createdAt: { type: 'string', nullable: true },
                      lastError: { type: 'string', nullable: true },
                      retryCount: { type: 'number' }
                    }
                  }
                }
              }
            },
            outbox: {
              type: 'object',
              properties: {
                totalPending: { type: 'number' },
                totalFailed: { type: 'number' },
                totalDead: { type: 'number' },
                pendingItems: { type: 'array', items: deliverySchema },
                failedItems: { type: 'array', items: deliverySchema },
                deadItems: { type: 'array', items: deliverySchema }
              }
            }
          }
        }
      }
    }
  }, async function webhookQueueHandler(request) {
    const { tenantId } = request.params;
    const { limit } = request.query || {};
    return webhookService.getWebhookQueueStatus(tenantId, { limit });
  });

  const manageHooks = [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)];
  fastify.post('/admin/tenants/:tenantId/webhooks/slack/connect', {
    preHandler: manageHooks,
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      events: { type: 'array', items: { type: 'string' } }, ...subscriptionProperties
    } } }
  }, async (request, reply) => {
    try { return await slackOAuth.beginSlackConnect(request.params.tenantId, request.user?._id, request.body || {}); }
    catch (error) { return handleServiceError(reply, error); }
  });
  fastify.post('/admin/tenants/:tenantId/webhooks/slack/complete', {
    preHandler: manageHooks,
    schema: { body: { type: 'object', required: ['code', 'state'], additionalProperties: false, properties: {
      code: { type: 'string', maxLength: 4096 }, state: { type: 'string', minLength: 64, maxLength: 64 }
    } } }
  }, async (request, reply) => {
    try { return await slackOAuth.completeSlackConnect(request.params.tenantId, request.user?._id, request.body); }
    catch (error) { return handleServiceError(reply, error); }
  });
  fastify.get('/admin/tenants/:tenantId/webhooks/deliveries', {
    preHandler: manageHooks,
    schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 }, webhookId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } } },
      response: { 200: { type: 'object', properties: { items: { type: 'array', items: deliverySchema } } } } }
  }, async (request) => webhookService.getDeliveries(request.params.tenantId, request.query));
  fastify.post('/admin/tenants/:tenantId/webhooks/deliveries/:deliveryId/replay', {
    preHandler: manageHooks,
    schema: { params: { type: 'object', properties: { tenantId: { type: 'string' }, deliveryId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } } } }
  }, async (request, reply) => {
    try { return await webhookService.replayDelivery(request.params.tenantId, request.params.deliveryId); }
    catch (error) { return handleServiceError(reply, error); }
  });

  fastify.post('/admin/tenants/:tenantId/webhooks', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      body: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          isActive: { type: 'boolean' },
          events: { type: 'array', items: { type: 'string' } },
          secret: { type: 'string', maxLength: 512 },
          provider: { type: 'string', enum: ['webhook', 'telegram', 'whatsapp'] },
          integration: integrationSchema, ...subscriptionProperties
        },
        additionalProperties: false
      },
      response: {
        201: {
          type: 'object',
          properties: {
            webhook: webhookResponseSchema,
            secret: { type: 'string' }
          }
        }
      }
    }
  }, async function createWebhookHandler(request, reply) {
    const { tenantId } = request.params;
    try {
      const result = await webhookService.createWebhook(tenantId, request.body || {});
      return reply.code(201).send(result);
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  fastify.put('/admin/tenants/:tenantId/webhooks/:id', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      body: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          isActive: { type: 'boolean' },
          events: { type: 'array', items: { type: 'string' } },
          integration: integrationSchema, ...subscriptionProperties
        },
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            webhook: webhookResponseSchema
          }
        }
      }
    }
  }, async function updateWebhookHandler(request, reply) {
    const { tenantId, id } = request.params;
    try {
      const webhook = await webhookService.updateWebhook(tenantId, id, request.body || {});
      return { webhook };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  fastify.delete('/admin/tenants/:tenantId/webhooks/:id', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' }
          }
        }
      }
    }
  }, async function deleteWebhookHandler(request) {
    const { tenantId, id } = request.params;
    await webhookService.deleteWebhook(tenantId, id);
    return { ok: true };
  });

  fastify.post('/admin/tenants/:tenantId/webhooks/:id/rotate-secret', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            secret: { type: 'string' },
            webhook: webhookResponseSchema
          }
        }
      }
    }
  }, async function rotateSecretHandler(request, reply) {
    const { tenantId, id } = request.params;
    try {
      const result = await webhookService.rotateSecret(tenantId, id);
      return { ok: true, ...result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  fastify.post('/admin/tenants/:tenantId/webhooks/trigger', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      body: {
        type: 'object',
        properties: {
          domainEventLimit: { type: 'number', minimum: 1, maximum: 500 },
          webhookLimit: { type: 'number', minimum: 1, maximum: 500 },
          maxRetryAttempts: { type: 'number', minimum: 1, maximum: 25 },
          retryBackoffMs: { type: 'number', minimum: 0, maximum: 600000 }
        },
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            result: {
              type: 'object',
              properties: {
                eventsResult: { type: 'object' },
                retryResult: { type: 'object' },
                dispatchResult: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async function webhookTriggerHandler(request, reply) {
    const { tenantId } = request.params;
    try {
      const result = await webhookService.triggerTenantWebhooks(tenantId, request.body || {});
      return { ok: true, result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  fastify.post('/admin/tenants/:tenantId/webhooks/:id/test', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      body: {
        type: 'object',
        properties: {
          payload: { type: 'object', additionalProperties: true }
        },
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            status: { type: 'number' }
          }
        }
      }
    }
  }, async function webhookTestHandler(request, reply) {
    const { tenantId, id } = request.params;
    try {
      const result = await webhookService.sendTestWebhook(tenantId, id, request.body?.payload || null);
      return result;
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  // ===== BULK OPERASYONLAR =====

  // Tüm başarısız işleri yeniden kuyruğa al
  fastify.post('/admin/tenants/:tenantId/webhooks/queue/retry-all', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            matched: { type: 'number' },
            retried: { type: 'number' }
          }
        }
      }
    }
  }, async function bulkRetryAllHandler(request, reply) {
    const { tenantId } = request.params;
    try {
      const result = await webhookService.bulkRetryAllFailed(tenantId);
      return { ok: true, ...result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  // Tüm başarısız işleri sil
  fastify.delete('/admin/tenants/:tenantId/webhooks/queue/failed', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            deleted: { type: 'number' }
          }
        }
      }
    }
  }, async function bulkDeleteAllHandler(request, reply) {
    const { tenantId } = request.params;
    try {
      const result = await webhookService.bulkDeleteAllFailed(tenantId);
      return { ok: true, ...result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  // Belirli bir webhook için başarısız işleri yeniden kuyruğa al
  fastify.post('/admin/tenants/:tenantId/webhooks/:id/queue/retry', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            matched: { type: 'number' },
            retried: { type: 'number' }
          }
        }
      }
    }
  }, async function bulkRetryByWebhookHandler(request, reply) {
    const { tenantId, id } = request.params;
    try {
      const result = await webhookService.bulkRetryByWebhook(tenantId, id);
      return { ok: true, ...result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  // Belirli bir webhook için başarısız işleri sil
  fastify.delete('/admin/tenants/:tenantId/webhooks/:id/queue/failed', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.TENANTS_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          id: { type: 'string' }
        },
        required: ['tenantId', 'id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            deleted: { type: 'number' }
          }
        }
      }
    }
  }, async function bulkDeleteByWebhookHandler(request, reply) {
    const { tenantId, id } = request.params;
    try {
      const result = await webhookService.bulkDeleteByWebhook(tenantId, id);
      return { ok: true, ...result };
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });
}

module.exports = webhookRoutes;
