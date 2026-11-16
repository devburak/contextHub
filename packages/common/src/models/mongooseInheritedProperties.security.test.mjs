import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

// GHSA-8332-j7wj-wjw4 can corrupt built-in functions process-wide. Run each
// payload in a child so a future dependency regression cannot poison Vitest.
describe.each([
  ['Content', 'customFields'],
  ['CollectionEntry', 'data'],
])('%s inherited-property isolation', (modelName, field) => {
  const modelPath = require.resolve(`./${modelName}.js`)

  it.each(['construct', 'set', 'hydrate', 'replace'])(
    'keeps built-in functions intact during %s',
    (operation) => {
      const script = `
        const assert = require('node:assert/strict');
        const Model = require(${JSON.stringify(modelPath)});
        const field = ${JSON.stringify(field)};
        const originalCall = Object.prototype.toString.call;
        const dotted = { [field + '.toString.call']: 1 };
        switch (${JSON.stringify(operation)}) {
          case 'construct': new Model(dotted); break;
          case 'set': new Model().set(dotted); break;
          case 'hydrate': Model.hydrate({ toString: { call: 1 } }); break;
          case 'replace': Model.findOneAndReplace({}, { toString: { call: 1 } }); break;
        }
        assert.equal(Object.prototype.toString.call, originalCall);
        assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype.toString, 'call'), false);
        const value = { title: 'Safe content', nested: { enabled: true } };
        const doc = new Model({ [field]: value });
        assert.deepEqual(doc.get(field), value);
        assert.deepEqual(Model.hydrate(doc.toObject()).get(field), value);
      `
      expect(() => execFileSync(process.execPath, ['-e', script], {
        timeout: 10_000,
        stdio: 'pipe',
      })).not.toThrow()
    },
  )
})
