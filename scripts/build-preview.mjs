import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

export const outputDir = path.resolve('dist/pages-preview');
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function productionTree(ref = 'origin/main') {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/._-]*$/.test(ref)) throw new Error('Riferimento Git non valido');
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Commit produzione non valido');
  const files = git('ls-tree', '-rz', `${sha}:public`).toString().split('\0').filter(Boolean).map(row => {
    const [header, name] = row.split('\t');
    const [mode, type, oid] = header.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode) || !name ||
      name.split('/').some(part => part === '..') || name.startsWith('/')) throw new Error('Voce Git non consentita');
    return { path: name, oid };
  });
  if (files.some(file => file.path === 'preview' || file.path.startsWith('preview/')))
    throw new Error('main contiene già preview/: serve una strategia di pubblicazione esplicita');
  return { sha, files };
}
export async function localFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Link simbolico non consentito: ' + name);
    if (entry.isDirectory()) files.push(...await localFiles(path.join(dir, entry.name), name + '/'));
    else if (entry.isFile()) files.push(name);
    else throw new Error('File speciale non consentito: ' + name);
  }
  return files;
}
function outputPath(name) {
  const resolved = path.resolve(outputDir, name);
  if (!resolved.startsWith(outputDir + path.sep)) throw new Error('Percorso fuori dalla cartella generata');
  return resolved;
}
export async function verifyPreview(ref = 'origin/main') {
  const production = productionTree(ref);
  const report = JSON.parse(await readFile('reports/preview-build.json', 'utf8'));
  if (report.productionCommit !== production.sha) throw new Error('main è cambiato: ricostruire la preview');
  const actual = await localFiles(outputDir);
  const expected = [...production.files.map(f => f.path), ...report.previewFiles.map(f => 'preview/' + f.path)];
  if (actual.length !== expected.length || actual.some(name => !expected.includes(name)))
    throw new Error('File mancanti o inattesi nel pacchetto');
  for (const file of production.files) {
    const original = git('cat-file', 'blob', file.oid);
    const staged = await readFile(outputPath(file.path));
    if (!original.equals(staged)) throw new Error('Produzione modificata: ' + file.path);
  }
  for (const file of report.previewFiles) {
    const bytes = await readFile(outputPath('preview/' + file.path));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('Preview modificata dopo la build: ' + file.path);
  }
  console.log(`PASS: ${production.files.length} file produzione identici a ${production.sha}; ${report.previewFiles.length} file preview verificati.`);
  return report;
}
export async function buildPreview(ref = 'origin/main') {
  const production = productionTree(ref);
  const candidates = await localFiles(path.resolve('public'));
  if (candidates.some(name => name === 'build.json' || name.startsWith('preview/')))
    throw new Error('Nome riservato nella sorgente public');
  const expected = new Set([...production.files.map(f => f.path), ...candidates.map(f => 'preview/' + f), 'preview/build.json']);
  try {
    if ((await lstat(outputDir)).isSymbolicLink()) throw new Error('Cartella output non valida');
    for (const name of await localFiles(outputDir)) {
      if (!expected.has(name)) throw new Error('File residuo nella cartella generata: ' + name);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const put = async (name, bytes) => {
    const destination = outputPath(name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  };
  // Production is read from Git blobs, never from the modified working directory.
  for (const file of production.files) await put(file.path, git('cat-file', 'blob', file.oid));
  const previewFiles = [];
  for (const name of candidates) {
    let bytes = await readFile(path.join('public', name));
    if (name === 'index.html') {
      let html = bytes.toString();
      if (!html.includes('<title>') || !html.includes('<h1>')) throw new Error('Pagina preview non riconosciuta');
      html = html.replace('<title>', '<meta name="c-pocket-channel" content="preview">\n<title>Prova - ')
        .replace('<h1>', '<aside id="preview-banner" class="preview-banner">VERSIONE DI PROVA: diagnostica da verificare su iPhone. <a href="../">Apri la versione principale</a>.</aside>\n<h1>');
      bytes = Buffer.from(html);
    }
    if (name === 'manifest.webmanifest') {
      const manifest = JSON.parse(bytes.toString());
      Object.assign(manifest, { name: 'C Pocket Lab - Prova diagnostica', short_name: 'C Lab Prova' });
      bytes = Buffer.from(JSON.stringify(manifest));
    }
    await put('preview/' + name, bytes);
    previewFiles.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
  }
  const metadata = Buffer.from(JSON.stringify({ channel: 'preview', build: 'study-diagnostics-v1',
    productionCommit: production.sha, createdAt: new Date().toISOString() }, null, 2));
  await put('preview/build.json', metadata);
  previewFiles.push({ path: 'build.json', bytes: metadata.length, sha256: digest(metadata) });
  await mkdir('reports', { recursive: true });
  await writeFile('reports/preview-build.json', JSON.stringify({ productionCommit: production.sha,
    productionRef: ref, output: 'dist/pages-preview', previewFiles }, null, 2));
  await verifyPreview(ref);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, 'path=dist/pages-preview\n', { flag: 'a' });
}
const refIndex = process.argv.indexOf('--production-ref');
const ref = refIndex < 0 ? 'origin/main' : process.argv[refIndex + 1];
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/build-preview.mjs')) {
  if (process.argv.includes('--check')) await verifyPreview(ref);
  else await buildPreview(ref);
}
