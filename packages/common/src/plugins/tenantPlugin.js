const mongoose = require('mongoose');
const { getTenantId } = require('../tenantContext');

const READ_METHODS = [
  'find',
  'findOne',
  'count',
  'countDocuments',
  'findOneAndUpdate',
  'updateOne',
  'updateMany'
];

/**
 * Global tenant enforcement plugin.
 * - Adds tenantId field when missing.
 * - Forces read queries to include tenantId from AsyncLocalStorage context or query options.
 * - Auto-fills tenantId on save/insert when context exists.
 */
function tenantPlugin(schema) {
  if (schema?.options?.skipTenantEnforcement) {
    return;
  }

  const hasTenantField = !!schema.path('tenantId');

  // If schema has no tenantId and is not explicitly opting in, skip
  if (!hasTenantField && !schema?.options?.enforceTenantEnforcement) {
    return;
  }

  // Add tenantId if not declared but enforcement is explicitly requested
  if (!hasTenantField && schema?.options?.enforceTenantEnforcement) {
    schema.add({
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
      }
    });
  } else if (hasTenantField) {
    // Ensure tenantId is indexed if already present
    const hasTenantIndex = schema.indexes().some(([fields]) => Object.prototype.hasOwnProperty.call(fields, 'tenantId'));
    if (!hasTenantIndex) {
      schema.index({ tenantId: 1 });
    }
  }

  const resolveTenantId = (queryOptions = {}) => {
    return queryOptions.tenantId || getTenantId();
  };

  // Apply tenant filter on read/update queries
  READ_METHODS.forEach((method) => {
    schema.pre(method, function(next) {
      const tenantId = resolveTenantId(this.getOptions());
      if (tenantId) {
        this.where({ tenantId });
      }
      next();
    });
  });

  // Ensure tenantId is set on save
  schema.pre('save', function(next) {
    if (!this.tenantId) {
      const tenantId = resolveTenantId();
      if (tenantId) {
        this.tenantId = tenantId;
      }
    }
    next();
  });

  // Ensure tenantId is set on insertMany
  schema.pre('insertMany', function(next, docs) {
    const tenantId = resolveTenantId();
    if (tenantId && Array.isArray(docs)) {
      docs.forEach((doc) => {
        if (!doc.tenantId) {
          doc.tenantId = tenantId;
        }
      });
    }
    next();
  });
}

module.exports = tenantPlugin;
