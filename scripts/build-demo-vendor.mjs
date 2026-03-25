import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const vendorDir = resolve(rootDir, 'demo', 'vendor');

async function bundleDependency(entryPoint, outputFile) {
  await build({
    absWorkingDir: rootDir,
    bundle: true,
    format: 'esm',
    minify: false,
    outfile: resolve(vendorDir, outputFile),
    platform: 'browser',
    sourcemap: false,
    target: 'es2022',
    entryPoints: [entryPoint],
    logLevel: 'silent',
  });
}

await mkdir(vendorDir, { recursive: true });

await Promise.all([
  bundleDependency('marked', 'marked.js'),
  bundleDependency('katex', 'katex.js'),
  bundleDependency('highlight.js', 'highlight.js'),
  bundleDependency('xss', 'xss.js'),
]);

console.log(`Demo vendor bundles written to ${vendorDir}`);
