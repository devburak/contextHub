#!/usr/bin/env node
// Read-only: no model initialization, collection creation, or index mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const sameKey = (a, b) => isDeepStrictEqual(Object.entries(a), Object.entries(b));
const options = (value) => ({
  unique: Boolean(value.unique), sparse: Boolean(value.sparse), hidden: Boolean(value.hidden),
  partialFilterExpression: value.partialFilterExpression,
  expireAfterSeconds: value.expireAfterSeconds,
  wildcardProjection: value.wildcardProjection,
  collation: value.collation || { locale: 'simple' },
});

export function compareIndexes(definitions, actual, startupKeys = []) {
  const seen = [];
  const duplicates = [];
  const declared = definitions.flatMap(([key, settings = {}]) => {
    if (seen.some(([otherKey, other]) => sameKey(key, otherKey) && isDeepStrictEqual(options(settings), options(other)))) {
      duplicates.push({ key, options: settings });
      return [];
    }
    seen.push([key, settings]);
    const candidates = actual.filter((index) => sameKey(index.key, key));
    const match = candidates.find((index) => isDeepStrictEqual(options(index), options(settings)));
    return [{ key, options: settings, enforcedOnStartup: startupKeys.some((other) => sameKey(key, other)),
      status: match ? 'present' : candidates.length ? 'incompatible-options' : 'missing',
      actualNames: candidates.map((index) => index.name) }];
  });
  return { declared, duplicates,
    extra: actual.filter((index) => index.name !== '_id_' && !definitions.some(([key]) => sameKey(key, index.key))) };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--help')) {
    console.log('Usage: node scripts/audit-indexes.mjs [--workspace DIR] [--env-file FILE] [--usage] [--out FILE]');
    return;
  }
  const workspace = path.resolve(value('--workspace') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const require = createRequire(path.join(workspace, 'package.json'));
  const dotenv = require('dotenv');
  const envFile = path.resolve(value('--env-file') || path.join(workspace, '.env'));
  const env = { ...dotenv.parse(await fs.readFile(envFile)), ...process.env };
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const mongoose = require('mongoose');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  const models = require(path.join(workspace, 'packages/common/src/models'));
  const deploymentIndexes = require(path.join(workspace, 'packages/common/src/deploymentIndexes'));
  const connection = mongoose.createConnection(env.MONGODB_URI, {
    autoIndex: false, autoCreate: false, readPreference: 'primary', serverSelectionTimeoutMS: 10000,
  });
  const report = { generatedAt: new Date().toISOString(), readOnly: true, collections: [],
    usageNote: '$indexStats counters are node-local and start at accesses.since. A zero count is not proof that an index can be removed.' };
  try {
    await connection.asPromise();
    const hello = await connection.db.admin().command({ hello: 1 });
    report.node = { name: hello.me, primary: Boolean(hello.isWritablePrimary) };
    for (const [name, model] of Object.entries(models)) {
      if (!model.schema || !model.collection) continue;
      const collectionName = model.collection.collectionName;
      const collection = connection.db.collection(collectionName);
      let actual = [];
      try { actual = await collection.listIndexes().toArray(); }
      catch (error) { if (error.code !== 26) throw error; }
      const item = { model: name, collection: collectionName,
        ...compareIndexes(model.schema.indexes(), actual, deploymentIndexes[name] || []), actual };
      if (args.includes('--usage') && actual.length) {
        try {
          item.usage = (await collection.aggregate([{ $indexStats: {} }], { maxTimeMS: 5000 }).toArray())
            .map(({ name: indexName, accesses, host }) => ({ name: indexName, accesses, host }));
        } catch (error) { item.usageUnavailable = { errorType: error.name, code: error.code }; }
      }
      report.collections.push(item);
    }
    report.summary = { collections: report.collections.length, present: 0, missing: 0,
      incompatible: 0, duplicateDeclarations: 0, extraActual: 0 };
    for (const item of report.collections) {
      for (const index of item.declared) report.summary[index.status === 'incompatible-options' ? 'incompatible' : index.status] += 1;
      report.summary.duplicateDeclarations += item.duplicates.length;
      report.summary.extraActual += item.extra.length;
    }
    if (value('--out')) await fs.writeFile(path.resolve(value('--out')), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report.summary));
  } finally { await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Read-only index audit failed: ${error.name}${error.code ? ` (${error.code})` : ''}`);
    process.exitCode = 1;
  });
}
