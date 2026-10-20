import { mkdir, readFile, writeFile, readdir, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { patchBrowsercc, patchDescription } from './patch-browsercc.mjs';
const root = path.resolve('public/vendor');
await mkdir('.downloads', { recursive: true });
await mkdir(root, { recursive: true });
async function download(url, destination) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  const data = Buffer.from(await r.arrayBuffer());
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return data;
}
async function npmPackage(name, version, dir) {
  const metadata = await fetch(`https://registry.npmjs.org/${name}/${version}`, { signal: AbortSignal.timeout(15000) });
  if (!metadata.ok) throw new Error(`Metadata ${name}: ${metadata.status}`);
  const info = await metadata.json();
  const archive = path.resolve('.downloads', dir + '.tgz');
  const data = await download(info.dist.tarball, archive);
  const [algorithm, digest] = info.dist.integrity.split('-');
  if (createHash(algorithm).update(data).digest('base64') !== digest) throw new Error(`Integrità fallita: ${name}`);
  const dest = path.join(root, dir);
  await mkdir(dest, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', dest]);
  return { name, version, integrity: info.dist.integrity, tarball: info.dist.tarball };
}
const provenance = [];
try {
  provenance.push(await npmPackage('browsercc', '0.1.1', 'browsercc'));
  await patchBrowsercc();
  provenance[0].patch = patchDescription;
  provenance.push(await npmPackage('@bjorn3/browser_wasi_shim', '0.4.2', 'wasi'));
  const metadata = await fetch('https://api.github.com/repos/binji/wasm-clang/commits/master', {
    headers: { 'User-Agent': 'c-pocket-lab-phase1' }, signal: AbortSignal.timeout(15000)
  });
  if (!metadata.ok) throw new Error(`Binji commit: ${metadata.status}`);
  const { sha } = await metadata.json();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Commit non valido');
  for (const name of ['clang', 'lld', 'memfs', 'sysroot.tar', 'shared.js', 'LICENSE', 'README.md']) {
    await download(`https://raw.githubusercontent.com/binji/wasm-clang/${sha}/${name}`, path.join(root, 'binji', name));
  }
  const sharedPath = path.join(root, 'binji/shared.js');
  const shared = await readFile(sharedPath, 'utf8');
  if (!shared.includes('return API;')) throw new Error('API binji modificata: adattatore da rivalutare');
  await copyFile(sharedPath, path.join(root, 'binji/shared.upstream.js'));
  await writeFile(sharedPath, shared.replace('return API;', 'API.App = App;\nreturn API;'));
  provenance.push({ name: 'binji/wasm-clang', commit: sha, patch: 'Expose API.App for structured execution and exit capture; upstream copy retained.' });
  const assets = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const bytes = await readFile(full);
        assets.push({ path: path.relative(path.resolve('public'), full).replaceAll('\\', '/'), bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await walk(root);
  for (const name of ['browsercc/dist/clang.wasm', 'browsercc/dist/lld.wasm', 'browsercc/dist/sysroot.tar', 'binji/clang', 'binji/lld', 'binji/memfs']) {
    if ((await stat(path.join(root, name))).size < 8) throw new Error(`Asset vuoto: ${name}`);
  }
  await writeFile('public/provenance.json', JSON.stringify(provenance, null, 2));
  const prov = await readFile('public/provenance.json');
  assets.push({ path: 'provenance.json', bytes: prov.length, sha256: createHash('sha256').update(prov).digest('hex') });
  await writeFile('public/assets.json', JSON.stringify(assets, null, 2));
  console.log(`Acquisiti ${assets.length} asset. Eseguire npm run check e la suite browser.`);
} catch (error) {
  console.error('ACQUISIZIONE BLOCCATA: nessuna dichiarazione di supporto C.\n' + error.stack);
  process.exitCode = 1;
}
