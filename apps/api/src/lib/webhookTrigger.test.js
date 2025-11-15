 import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

const processDomainEventsBatchMock = vi.fn();
const dispatchWebhookOutboxBatchMock = vi.fn();
const retryFailedWebhookJobsMock = vi.fn();

let runTenantWebhookPipeline;
let triggerWebhooksForTenant;
let setDeps;
const originalQueueMicrotask = global.queueMicrotask;

beforeAll(async () => {
  const webhookTrigger = await import('./webhookTrigger');
  runTenantWebhookPipeline = webhookTrigger.runTenantWebhookPipeline;
  triggerWebhooksForTenant = webhookTrigger.triggerWebhooksForTenant;
  setDeps = webhookTrigger.__setWebhookTriggerDeps;
});

afterAll(() => {
  setDeps();
});

const resetMocks = () => {
  processDomainEventsBatchMock.mockReset().mockResolvedValue({ processed: 1 });
  dispatchWebhookOutboxBatchMock.mockReset().mockResolvedValue({ processed: 2 });
  retryFailedWebhookJobsMock.mockReset().mockResolvedValue({ retried: 0 });
  setDeps({
    processDomainEventsBatch: processDomainEventsBatchMock,
    dispatchWebhookOutboxBatch: dispatchWebhookOutboxBatchMock,
    retryFailedWebhookJobs: retryFailedWebhookJobsMock
  });
};

describe('runTenantWebhookPipeline', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('throws when tenantId is missing', async () => {
    await expect(runTenantWebhookPipeline({})).rejects.toThrow('[webhookTrigger] tenantId is required');
  });

  it('runs both batches sequentially with provided limits', async () => {
    const result = await runTenantWebhookPipeline({
      tenantId: 'tenant_1',
      domainEventLimit: 25,
      webhookLimit: 10,
      maxRetryAttempts: 7,
      retryBackoffMs: 12345
    });

    expect(processDomainEventsBatchMock).toHaveBeenCalledWith({ tenantId: 'tenant_1', limit: 25 });
    expect(retryFailedWebhookJobsMock).toHaveBeenCalledWith({ tenantId: 'tenant_1', maxAttempts: 7, backoffMs: 12345 });
    expect(dispatchWebhookOutboxBatchMock).toHaveBeenCalledWith({ tenantId: 'tenant_1', limit: 10, maxAttempts: 7 });
    expect(result).toEqual({
      eventsResult: { processed: 1 },
      retryResult: { retried: 0 },
      dispatchResult: { processed: 2 }
    });
  });
});

describe('triggerWebhooksForTenant', () => {
  let queueMicrotaskSpy;
  let scheduledTask;

  beforeEach(() => {
    resetMocks();
    scheduledTask = null;
    if (typeof global.queueMicrotask !== 'function') {
      global.queueMicrotask = (cb) => setTimeout(cb, 0);
    }
    queueMicrotaskSpy = vi.spyOn(global, 'queueMicrotask').mockImplementation((callback) => {
      scheduledTask = callback;
    });
  });

  afterEach(() => {
    queueMicrotaskSpy?.mockRestore();
    if (originalQueueMicrotask) {
      global.queueMicrotask = originalQueueMicrotask;
    } else {
      delete global.queueMicrotask;
    }
  });

  it('skips scheduling when tenantId is missing', () => {
    triggerWebhooksForTenant(null);
    expect(queueMicrotaskSpy).not.toHaveBeenCalled();
    expect(processDomainEventsBatchMock).not.toHaveBeenCalled();
  });

  it('normalizes tenant ids and schedules the pipeline asynchronously', async () => {
    const tenantObject = { toString: () => 'tenant_2' };
    triggerWebhooksForTenant(tenantObject, { domainEventLimit: 5, webhookLimit: 3, maxRetryAttempts: 9, retryBackoffMs: 999 });
    expect(queueMicrotaskSpy).toHaveBeenCalledTimes(1);
    await scheduledTask();
    expect(processDomainEventsBatchMock).toHaveBeenCalledWith({ tenantId: 'tenant_2', limit: 5 });
    expect(retryFailedWebhookJobsMock).toHaveBeenCalledWith({ tenantId: 'tenant_2', maxAttempts: 9, backoffMs: 999 });
    expect(dispatchWebhookOutboxBatchMock).toHaveBeenCalledWith({ tenantId: 'tenant_2', limit: 3, maxAttempts: 9 });
  });
});
