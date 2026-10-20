import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const patchDescription = 'Move language flags before input filename in getCompilerInvocation: -x c must apply to main.c instead of subsequent inputs.';
export async function patchBrowsercc() {
  const file = 'public/vendor/browsercc/dist/index.js';
  const source = await readFile(file, 'utf8');
  const before = 'clang.callMain([inputName, ...flags, "-###"])';
  const after = 'clang.callMain([...flags, inputName, "-###"])';
  if (!source.includes(before) && !source.includes(after)) throw new Error('browsercc invocation changed: review language patch');
  await writeFile(file, source.replace(before, after));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await patchBrowsercc();
  const provenance = JSON.parse(await readFile('public/provenance.json', 'utf8'));
  provenance.find(p => p.name === 'browsercc').patch = patchDescription;
  await writeFile('public/provenance.json', JSON.stringify(provenance, null, 2));
  const assets = JSON.parse(await readFile('public/assets.json', 'utf8'));
  for (const name of ['vendor/browsercc/dist/index.js', 'provenance.json']) {
    const bytes = await readFile('public/' + name);
    Object.assign(assets.find(a => a.path === name), { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile('public/assets.json', JSON.stringify(assets, null, 2));
  console.log('browsercc language-order patch applied; hashes/provenance updated.');
}
