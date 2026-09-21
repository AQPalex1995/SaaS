// Copies non-TS static assets emitted by `tsc` into dist/ so the runtime
// build (node dist/index.js) finds them at the same relative path as dev.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const assets = [
  ['src/domain/dossier/expediente.html', 'dist/domain/dossier/expediente.html'],
];

for (const [from, to] of assets) {
  const dest = join(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(root, from), dest);
  console.log(`[copy-assets] ${to}`);
}