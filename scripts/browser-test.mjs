// No npm dependencies: Node 22+ WebSocket and an installed Chromium browser.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { verifyPreview } from './build-preview.mjs';
const previewMode = process.argv.includes('--preview');
if (previewMode) await verifyPreview();
const reports = path.resolve('reports');
await mkdir(reports, { recursive: true });
const profile = path.resolve('.browser-test-profile', String(Date.now()));
await mkdir(profile, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const root = path.resolve(previewMode ? 'dist/pages-preview' : 'public');
const mountPath = previewMode ? '/c-pocket-lab/' : '/';
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!name.startsWith(mountPath)) throw new Error('Outside site mount');
    let relative = name.slice(mountPath.length);
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = `http://127.0.0.1:${server.address().port}`;
const productionURL = host + mountPath;
const origin = previewMode ? host + mountPath + 'preview' : host;
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
async function navigate(url) {
  await cdp('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)} && Boolean(document.querySelector('#compile'))`)) return;
    await sleep(100);
  }
  throw new Error('Page not loaded: ' + url);
}
async function prepareViaButton(engine) {
  return evaluate(`(async () => {
    document.querySelector('#engine').value=${JSON.stringify(engine)};
    document.querySelector('#offline').click();
    const deadline=Date.now()+180000;
    while(Date.now()<deadline) {
      const message=document.querySelector('#status').textContent;
      if(message.startsWith('Cache completa')) return message;
      if(message.startsWith('Offline NON pronto') || message.startsWith('Error:')) throw new Error(message);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('Offline preparation timeout');
  })()`);
}
async function cacheSnapshot(names) {
  return evaluate(`(async () => {
    const snapshot={};
    for(const name of ${JSON.stringify(names)}) {
      const cache=await caches.open(name);
      const keys=(await cache.keys()).map(r=>r.url).sort();
      const index=await cache.match(${JSON.stringify(productionURL + 'index.html')});
      snapshot[name]={keys,index:index?await index.text():null};
    }
    return snapshot;
  })()`);
}
async function runProductionProgram() {
  return evaluate(`(async () => {
    document.querySelector('#engine').value='binji';
    document.querySelector('#source').value='#include <stdio.h>\\nint main(void) { puts("production preserved"); return 0; }\\n';
    document.querySelector('#compile').click();
    const deadline=Date.now()+30000;
    while(document.querySelector('#compile').disabled && Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,25));
    return {output:document.querySelector('#output').textContent,
      controller:navigator.serviceWorker.controller?.scriptURL,
      previewBanner:Boolean(document.querySelector('#preview-banner'))};
  })()`);
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
  let productionCacheNames = [], originalCache;
  const isolationChecks = [];
  if (previewMode) {
    await navigate(productionURL);
    console.log('Prepare original main app before opening preview...');
    await prepareViaButton('binji');
    await navigate(productionURL);
    const original = await runProductionProgram();
    if (original.output !== 'production preserved\n' || original.previewBanner) throw new Error('Original app unavailable before preview');
    productionCacheNames = await evaluate('caches.keys()');
    originalCache = await cacheSnapshot(productionCacheNames);
    isolationChecks.push({ id: 'production-before-preview', status: 'PASS', observed: original });
  }
  await navigate(origin + '/');
  const mode = process.argv.includes('--offline') ? 'offline' : 'online';
  if (mode === 'offline' || previewMode) {
    if (previewMode) {
      console.log('Cache:', await prepareViaButton('browsercc'));
      console.log('Cache:', await prepareViaButton('binji'));
    } else {
      const ready = await evaluate(`import('./offline.js').then(m=>m.prepareOffline())`);
      console.log('Cache:', ready);
      if (!ready.message.startsWith('Cache completa')) throw new Error(ready.message);
    }
    await navigate(origin + '/');
    if (previewMode) {
      const registration = await evaluate(`(async()=>({
        root:(await navigator.serviceWorker.getRegistration(${JSON.stringify(productionURL)}))?.scope,
        preview:(await navigator.serviceWorker.getRegistration(location.href))?.scope,
        controller:navigator.serviceWorker.controller?.scriptURL,
        banner:Boolean(document.querySelector('#preview-banner')),
        manifest:await(await fetch('./manifest.webmanifest')).json(), caches:await caches.keys()
      }))()`);
      const passed = registration.root === productionURL && registration.preview === origin + '/' &&
        registration.controller === origin + '/sw.js' && registration.banner &&
        registration.manifest.short_name === 'C Lab Prova' && registration.manifest.id === './' &&
        registration.caches.some(name => !productionCacheNames.includes(name) && name.endsWith('/c-pocket-lab/preview/'));
      isolationChecks.push({ id: 'preview-scope-cache-and-install-identity', status: passed ? 'PASS' : 'FAIL', observed: registration });
    }
  }
  if (mode === 'offline') {
    // Block every origin-server request. Service worker may serve only its cache.
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    // Also stop the actual server: worker network fallback cannot succeed.
    await new Promise(resolve => server.close(resolve));
    await navigate(origin + '/');
  }
  const engines = process.argv.includes('--screenshot-only') ? [] : process.argv.includes('--browsercc-only') ? ['browsercc'] : ['browsercc', 'binji'];
  let failed = false;
  for (const engine of engines) {
    console.log(`Running ${engine} (${mode})...`);
    const report = await evaluate(`import('./runner.js').then(m => m.runSuite(${JSON.stringify(engine)}))`);
    if (process.argv.includes('--probes')) {
      report.sanitizerProbes = await evaluate(`(async () => {
        const {sanitizerProbes} = await import('./tests/cases.js');
        const {runCase} = await import('./runner.js');
        const observations = [];
        for (const test of sanitizerProbes) observations.push(await runCase(${JSON.stringify(engine)}, test));
        return observations;
      })()`);
    }
    report.uiChecks = await evaluate(`(async () => {
      const engine = ${JSON.stringify(engine)};
      const {cases} = await import('./tests/cases.js');
      const checks = [];
      const read = () => ({diagnostics:document.querySelector('#diagnostics').textContent,
        output:document.querySelector('#output').textContent,
        runtime:document.querySelector('#runtime-errors').textContent,
        status:document.querySelector('#status').textContent});
      async function run(source) {
        document.querySelector('#engine').value = engine;
        document.querySelector('#source').value = source;
        document.querySelector('#compile').click();
        const deadline = Date.now() + 30000;
        while(document.querySelector('#compile').disabled && Date.now() < deadline)
          await new Promise(resolve => setTimeout(resolve,25));
        if(document.querySelector('#compile').disabled) throw new Error('UI completion timeout');
        return read();
      }
      function check(id, pass, observed) { checks.push({id,status:pass?'PASS':'FAIL',observed}); }
      let r = await run(cases.find(c=>c.id==='warning-unused-variable').source);
      check('warning-visible-after-success',r.diagnostics.includes('[-Wunused-variable]') &&
        r.diagnostics.includes('main.c:2:') && r.diagnostics.includes('^') &&
        !r.diagnostics.includes(String.fromCharCode(27)) && r.status.includes('warning') && r.status.includes('exit 0'),r);
      r = await run(cases.find(c=>c.id==='syntax-location').source);
      check('manual-compile-error-visible',r.diagnostics.includes('error: expected expression') &&
        r.status.includes('Compilazione fallita') && r.output.includes('Programma non eseguito'),r);
      r = await run(cases.find(c=>c.id==='runtime-divide-zero').source);
      check('runtime-error-keeps-output',r.output==='before crash\\n' &&
        r.runtime.includes('RuntimeError:') && /divide by zero|division by zero/i.test(r.runtime) &&
        r.status.includes('Errore durante esecuzione'),r);
      r = await run('#include <stdio.h>\\nint main(void) { puts("<b>recovery</b>"); return 0; }\\n');
      check('recovery-and-output-as-text',r.output==='<b>recovery</b>\\n' &&
        !document.querySelector('#output b') && r.status.includes('exit 0') && !r.runtime.includes('RuntimeError'),r);
      document.querySelector('#source').value=cases.find(c=>c.id==='timeout').source;
      document.querySelector('#compile').click();
      const deadline=Date.now()+30000;
      while(!document.querySelector('#status').textContent.includes('Esecuzione locale') && Date.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,25));
      document.querySelector('#stop').click();
      while(document.querySelector('#compile').disabled && Date.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,25));
      r=read();
      check('stop-infinite-program',r.status.includes('Arrestato') && !document.querySelector('#compile').disabled,r);
      return checks;
    })()`);
    report.testHost = { platform: process.platform, node: process.version, mode, serverStopped: mode === 'offline' };
    report.provenance = JSON.parse(await readFile('public/provenance.json', 'utf8'));
    await writeFile(path.join(reports, `${process.platform === 'win32' ? 'windows' : process.platform}-chrome-${engine}-${mode}${previewMode ? '-preview' : ''}.json`), JSON.stringify(report, null, 2));
    for (const r of report.results) console.log(`${r.id}: ${r.status} ${r.ms ? Math.round(r.ms) + 'ms' : ''} ${r.reason || ''}`);
    for (const r of report.uiChecks) console.log(`UI ${r.id}: ${r.status}`);
    failed ||= report.results.some(r => r.status !== 'PASS');
    failed ||= report.uiChecks.some(r => r.status !== 'PASS');
    if (previewMode) failed ||= report.channel !== 'preview';
  }
  if (previewMode) {
    const currentCache = await cacheSnapshot(productionCacheNames);
    isolationChecks.push({ id: 'original-cache-unchanged', status: JSON.stringify(currentCache) === JSON.stringify(originalCache) ? 'PASS' : 'FAIL' });
    await navigate(productionURL);
    const original = await runProductionProgram();
    isolationChecks.push({ id: 'production-after-preview', status: original.output === 'production preserved\n' &&
      original.controller === productionURL + 'sw.js' && !original.previewBanner ? 'PASS' : 'FAIL', observed: original });
    const build = await verifyPreview();
    isolationChecks.push({ id: 'production-files-unchanged', status: 'PASS', productionCommit: build.productionCommit });
    await writeFile(path.join(reports, `preview-isolation-${mode}.json`), JSON.stringify({
      platform: process.platform, mode, serverStopped: mode === 'offline', checks: isolationChecks }, null, 2));
    for (const r of isolationChecks) console.log(`Isolation ${r.id}: ${r.status}`);
    failed ||= isolationChecks.some(r=>r.status !== 'PASS');
    await navigate(origin + '/');
  }
  if (process.argv.includes('--screenshot') || process.argv.includes('--screenshot-only')) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`(async () => {
      const {cases} = await import('./tests/cases.js');
      document.querySelector('#engine').value='binji';
      document.querySelector('#source').value=cases.find(c=>c.id==='warning-unused-variable').source;
      document.querySelector('#compile').click();
      const deadline=Date.now()+30000;
      while(document.querySelector('#compile').disabled && Date.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,25));
    })()`);
    const metrics = await cdp('Page.getLayoutMetrics');
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 390, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } });
    await writeFile(path.join(reports, `${previewMode ? 'preview-' : ''}diagnostics-mobile-chrome.png`), Buffer.from(screenshot.data, 'base64'));
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  ws?.close(); chrome.kill(); server.close();
}
