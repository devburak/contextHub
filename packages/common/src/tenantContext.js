const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function run(initialContext = {}, callback) {
  return storage.run(initialContext || {}, callback);
}

function setContext(partial = {}) {
  const current = storage.getStore() || {};
  storage.enterWith({ ...current, ...partial });
}

function getTenantId() {
  return storage.getStore()?.tenantId || null;
}

function getUserId() {
  return storage.getStore()?.userId || null;
}

module.exports = {
  run,
  setContext,
  getTenantId,
  getUserId
};
