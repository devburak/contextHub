const { isDeepStrictEqual } = require('node:util');
const deploymentIndexes = require('./deploymentIndexes');

const sameKey = (actual, expected) =>
  isDeepStrictEqual(Object.entries(actual), Object.entries(expected));

const compatibleIndex = (actual, key, options = {}) => {
  if (!sameKey(actual.key, key)) return false;

  // Names, background build options and server index versions do not change
  // query coverage. Missing Boolean options mean false in MongoDB.
  for (const option of ['unique', 'sparse', 'hidden']) {
    if (Boolean(actual[option]) !== Boolean(options[option])) return false;
  }
  for (const option of ['partialFilterExpression', 'expireAfterSeconds', 'wildcardProjection']) {
    if (!isDeepStrictEqual(actual[option], options[option])) return false;
  }

  const actualCollation = actual.collation || { locale: 'simple' };
  const expectedCollation = options.collation || { locale: 'simple' };
  return isDeepStrictEqual(actualCollation, expectedCollation);
};

const readIndexes = async (model) => {
  try {
    return await model.collection.listIndexes().toArray();
  } catch (error) {
    // A newly deployed database may not have this collection yet. createIndex
    // creates it; all other errors (including missing permissions) must surface.
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const ensureModelIndexes = async (model, definitions) => {
  let actualIndexes = await readIndexes(model);
  for (const [key, options] of definitions) {
    if (actualIndexes.some((index) => compatibleIndex(index, key, options))) continue;
    try {
      await model.collection.createIndex(key, options);
    } catch (error) {
      throw new Error(
        `Failed to create ${model.modelName} index ${JSON.stringify(key)}: ${error.message}`,
        { cause: error }
      );
    }
    // Re-read instead of assuming createIndex succeeded or that a concurrent
    // startup built the index with the options this application requires.
    actualIndexes = await readIndexes(model);
  }

  const verifiedIndexes = await readIndexes(model);
  const missing = definitions.filter(([key, options]) =>
    !verifiedIndexes.some((index) => compatibleIndex(index, key, options))
  );
  if (missing.length) {
    throw new Error(
      `Index verification failed for ${model.modelName}: ${JSON.stringify(missing)}`
    );
  }
};

const ensureDeploymentIndexes = async (models) => {
  for (const [modelName, requiredKeys] of Object.entries(deploymentIndexes)) {
    const model = models[modelName];
    const definitions = requiredKeys.map((key) => {
      const definition = model.schema.indexes().find(([fields]) => sameKey(fields, key));
      if (!definition) {
        throw new Error(`Required deployment index missing from ${modelName} schema: ${JSON.stringify(key)}`);
      }
      return definition;
    });
    await ensureModelIndexes(model, definitions);
  }
};

module.exports = { ensureModelIndexes, ensureDeploymentIndexes };
