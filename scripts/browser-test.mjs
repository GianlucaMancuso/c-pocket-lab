// No npm dependencies: Node 22+ WebSocket and an installed Chromium browser.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const reports = path.resolve('reports');
await mkdir(reports, { recursive: true });
const profile = path.resolve('.browser-test-profile', String(Date.now()));
await mkdir(profile, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const root = path.resolve('public');
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--no-sandbox', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let ws;
let launchError;
let chromeLog = '';
chrome.on('error', error => { launchError = error; });
chrome.stderr.on('data', data => { chromeLog = (chromeLog + data).slice(-5000); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let nextId = 0;
const pending = new Map();
function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}\n${chromeLog}`)); }, 600000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Chrome DevTools endpoint unavailable');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    }
  };
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: origin + '/' });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.readyState === "complete" && location.pathname === "/"')) break;
    await sleep(100);
  }
  const mode = process.argv.includes('--offline') ? 'offline' : 'online';
  if (mode === 'offline') {
    const ready = await evaluate(`(async () => {
      await navigator.serviceWorker.register('./sw.js');
      const registration = await navigator.serviceWorker.ready;
      return await new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = e => resolve(e.data);
        registration.active.postMessage({command:'prepare'}, [channel.port2]);
      });
    })()`);
    console.log('Cache:', ready);
    if (!ready.message.startsWith('Cache completa')) throw new Error(ready.message);
    await cdp('Page.navigate', { url: origin + '/' });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('Boolean(navigator.serviceWorker.controller)')) break;
      await sleep(100);
    }
    // Block every origin-server request. Service worker may serve only its cache.
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    // Also stop the actual server: worker network fallback cannot succeed.
    await new Promise(resolve => server.close(resolve));
    await cdp('Page.navigate', { url: origin + '/' });
    await sleep(500);
  }
  const engines = process.argv.includes('--browsercc-only') ? ['browsercc'] : ['browsercc', 'binji'];
  let failed = false;
  for (const engine of engines) {
    console.log(`Running ${engine} (${mode})...`);
    const report = await evaluate(`import('./runner.js').then(m => m.runSuite(${JSON.stringify(engine)}))`);
    report.testHost = { platform: process.platform, node: process.version, mode, serverStopped: mode === 'offline' };
    report.provenance = JSON.parse(await readFile('public/provenance.json', 'utf8'));
    await writeFile(path.join(reports, `windows-chrome-${engine}-${mode}.json`), JSON.stringify(report, null, 2));
    for (const r of report.results) console.log(`${r.id}: ${r.status} ${r.ms ? Math.round(r.ms) + 'ms' : ''} ${r.reason || ''}`);
    failed ||= report.results.some(r => r.status !== 'PASS');
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  ws?.close(); chrome.kill(); server.close();
}
