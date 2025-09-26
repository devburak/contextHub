const { FeatureFlagDefinition } = require('@contexthub/common');

class FeatureFlagService {
  async listFlags() {
    const flags = await FeatureFlagDefinition.find({}).sort({ label: 1, key: 1 }).lean();
    return flags.map((flag) => ({
      id: flag._id.toString(),
      key: flag.key,
      label: flag.label,
      description: flag.description,
      defaultEnabled: Boolean(flag.defaultEnabled),
      notes: flag.notes,
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt
    }));
  }

  async createFlag({ key, label, description = '', defaultEnabled = false, notes = '' }) {
    if (!key || !label) {
      throw new Error('Key and label are required');
    }

    const normalisedKey = key.trim();
    const existing = await FeatureFlagDefinition.findOne({ key: normalisedKey });
    if (existing) {
      const error = new Error('Feature flag key already exists');
      error.statusCode = 409;
      throw error;
    }

    const doc = await FeatureFlagDefinition.create({
      key: normalisedKey,
      label: label.trim(),
      description: description?.trim() || '',
      defaultEnabled: Boolean(defaultEnabled),
      notes: notes?.trim() || ''
    });

    return {
      id: doc._id.toString(),
      key: doc.key,
      label: doc.label,
      description: doc.description,
      defaultEnabled: doc.defaultEnabled,
      notes: doc.notes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }
}

module.exports = new FeatureFlagService();
