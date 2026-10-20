import { runSuite, runProgram } from './runner.js';
const status = document.querySelector('#status');
let lastReport;
let controller;
function busy(value) {
  for (const id of ['compile', 'run', 'engine', 'offline']) document.getElementById(id).disabled = value;
}
document.querySelector('#compile').onclick = async () => {
  busy(true);
  controller = new AbortController();
  document.querySelector('#stop').disabled = false;
  const output = document.querySelector('#output');
  output.textContent = 'Compilazione locale…';
  try {
    const result = await runProgram(document.querySelector('#engine').value,
      document.querySelector('#source').value, document.querySelector('#stdin').value,
      { signal: controller.signal, onPhase: phase => { status.textContent = phase === 'compile' ? 'Compilazione locale…' : 'Esecuzione locale…'; } });
    output.textContent = result.compileError ? result.diagnostics :
      (result.stdout || '') + (result.stderr || '') + (result.reason ? '\n' + result.reason : '');
    status.textContent = `${result.status}${result.exitCode !== undefined ? ' · exit ' + result.exitCode : ''}${result.ms ? ' · ' + Math.round(result.ms) + ' ms' : ''}`;
  } catch (error) { output.textContent = String(error); }
  finally { busy(false); document.querySelector('#stop').disabled = true; controller = undefined; }
};
document.querySelector('#stop').onclick = () => controller?.abort();
document.querySelector('#run').onclick = async () => {
  busy(true);
  status.textContent = '';
  try {
    lastReport = await runSuite(document.querySelector('#engine').value, r => {
      status.textContent += `${r.id}: ${r.status}\n${r.reason || ''}\n`;
    });
    document.querySelector('#export').disabled = false;
  } finally { busy(false); }
};
document.querySelector('#export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `c-pocket-${lastReport.engine}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.querySelector('#offline').onclick = async () => {
  try {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker non disponibile: usare HTTPS o localhost.');
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => { status.textContent = data.message; };
    registration.active.postMessage({ command: 'prepare', engine: document.querySelector('#engine').value }, [channel.port2]);
    status.textContent = 'Acquisizione cache locale in corso…';
  } catch (error) { status.textContent = String(error); }
};
