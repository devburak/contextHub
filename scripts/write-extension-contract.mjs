#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createExtensionContractDescriptor } = require(
  '../apps/api/src/lib/extensionContract'
);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function outputArgument(args) {
  const index = args.indexOf('--output');
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value) throw new Error('--output requires a file path');
  return path.resolve(value);
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(path.join(rootDirectory, 'package.json'), 'utf8')
  );
  const descriptor = createExtensionContractDescriptor(packageJson.version);
  const serialized = `${JSON.stringify(descriptor, null, 2)}\n`;
  const outputPath = outputArgument(process.argv.slice(2));

  if (!outputPath) {
    process.stdout.write(serialized);
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`[extension-contract] Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(`[extension-contract] ${error.message}`);
  process.exitCode = 1;
});
