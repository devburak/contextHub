export async function registerApi(app, context) {
  app.get('/ping', async () => ({
    ok: true,
    plugin: context.plugin.name,
    apiVersion: context.version,
    apiRevision: context.revision
  }));
}

export async function registerConsumers(context) {
  context.events.register('dummy-consumer', {
    types: ['content.updated'],
    batchSize: 10,
    maxAttempts: 3,
    initialPosition: 'earliest',
    handle: async () => {}
  });
}
