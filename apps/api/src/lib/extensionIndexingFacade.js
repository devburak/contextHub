const { Content, CollectionEntry, mongoose } = require('@contexthub/common');
const { allocateDomainEventSequence } = require('./domainEvents');

const ID = /^[a-f0-9]{24}$/i;

// Only source identities cross this facade. Snapshots still pass through the
// existing source facade and the plugin's explicit field allow-list.
function createExtensionIndexingFacade({
  contentModel = Content,
  entryModel = CollectionEntry,
  allocateSequence = () => allocateDomainEventSequence(mongoose.connection.db)
} = {}) {
  return Object.freeze({
    async allocateSequence({ tenantId } = {}) {
      validateId(tenantId, 'tenantId');
      return allocateSequence();
    },
    async scanSources({ tenantId, sourceType, after = null, limit = 25 } = {}) {
      validateId(tenantId, 'tenantId');
      if (after !== null) validateId(after, 'after');
      if (!['content', 'collectionEntry'].includes(sourceType)) {
        throw new TypeError('unsupported source type');
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('limit must be between 1 and 100');
      }
      const model = sourceType === 'content' ? contentModel : entryModel;
      // Include drafts and disabled collections so a policy change can remove
      // previously indexed documents as well as upsert published ones.
      const rows = await model.find({ tenantId, ...(after ? { _id: { $gt: after } } : {}) })
        .select('_id tenantId collectionKey').sort({ _id: 1 }).limit(limit + 1).lean();
      if (rows.some((row) => String(row.tenantId) !== tenantId)) {
        throw new Error('index source tenant boundary violation');
      }
      return {
        items: rows.slice(0, limit).map((row) => ({
          sourceId: String(row._id), sourceType,
          ...(sourceType === 'collectionEntry' ? { collectionKey: row.collectionKey } : {})
        })),
        hasMore: rows.length > limit
      };
    }
  });
}

function validateId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be an ObjectId`);
}

module.exports = { createExtensionIndexingFacade };
