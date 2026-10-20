import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cases } from '../public/tests/cases.js';
const mode = process.argv.includes('--scaffold-only');
let failures = 0;
const fail = message => { failures++; console.error('FAIL: ' + message); };
for (const dir of ['public', 'scripts', 'public/tests']) {
  for (const name of await readdir(dir)) {
    if (/\.(js|mjs)$/.test(name)) execFileSync(process.execPath, ['--check', `${dir}/${name}`]);
  }
}
if (new Set(cases.map(c => c.id)).size !== cases.length) fail('ID test duplicati');
for (const id of ['printf', 'scanf', 'loops-functions-arrays', 'strings-pointers-struct', 'malloc-free', 'files',
  'scanf-eof', 'compile-error', 'exit-status', 'timeout', 'warning-unused-variable', 'warning-unused-parameter',
  'warning-printf-format', 'syntax-location', 'debug-symbols', 'runtime-divide-zero', 'runtime-memory-bounds']) {
  if (!cases.some(c => c.id === id)) fail('Caso mancante: ' + id);
}
console.log(`PASS: sintassi JavaScript e inventario di ${cases.length} casi; nessuna compilazione C effettuata da questo controllo.`);
if (!mode) {
  try {
    const assets = JSON.parse(await readFile('public/assets.json', 'utf8'));
    for (const a of assets) {
      if (!/^(vendor\/|provenance\.json$)/.test(a.path) || a.path.includes('..')) { fail('Percorso asset invalido'); continue; }
      const bytes = await readFile('public/' + a.path);
      if (bytes.length !== a.bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256) fail(`Hash: ${a.path}`);
      if (/\.(js|mjs)$/.test(a.path)) {
        const text = bytes.toString();
        if (/(?:from\s*|import\s*\()\s*['"]https?:/.test(text)) fail(`Import remoto: ${a.path}`);
      }
    }
    for (const file of ['browsercc/dist/index.js', 'browsercc/dist/clang.wasm', 'browsercc/dist/lld.wasm', 'browsercc/dist/sysroot.tar', 'wasi/dist/index.js', 'binji/clang', 'binji/lld', 'binji/memfs', 'binji/sysroot.tar', 'binji/shared.js']) {
      await stat('public/vendor/' + file);
      if (!assets.some(a => a.path === 'vendor/' + file)) fail('Asset fuori manifest: ' + file);
    }
    console.log('Controllo asset locali completato. I test C richiedono ancora il browser.');
  } catch (error) { fail('Asset toolchain non disponibili: ' + error.message); }
}
process.exitCode = failures ? 1 : 0;
