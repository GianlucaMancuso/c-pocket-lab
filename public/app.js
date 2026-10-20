import { runSuite, runProgram } from './runner.js';
import { plainLog, formatRuntimeError } from './diagnostics.js';
import { prepareOffline } from './offline.js';
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
  const diagnostics = document.querySelector('#diagnostics');
  const runtime = document.querySelector('#runtime-errors');
  diagnostics.textContent = 'Compilazione locale in corso...';
  runtime.textContent = '';
  output.textContent = 'Compilazione locale…';
  try {
    const result = await runProgram(document.querySelector('#engine').value,
      document.querySelector('#source').value, document.querySelector('#stdin').value,
      { signal: controller.signal, onPhase: phase => { status.textContent = phase === 'compile' ? 'Compilazione locale…' : 'Esecuzione locale…'; } });
    diagnostics.textContent = plainLog(result.diagnostics || 'Nessun messaggio dal compilatore.');
    output.textContent = (result.stdout || '') + (result.stderr || '') ||
      (result.compileError ? 'Programma non eseguito: correggi gli errori di compilazione.' : 'Nessun output.');
    runtime.textContent = result.runtimeError ?
      formatRuntimeError(result.runtimeError) :
      result.reason ? plainLog(result.reason) : result.compileError ? 'Esecuzione non avviata.' : 'Nessun errore runtime rilevato. Questo non dimostra assenza di errori nel C.';
    const labels = { OK: 'Esecuzione completata', COMPILE_ERROR: 'Compilazione fallita', RUNTIME_ERROR: 'Errore durante esecuzione',
      EXIT: 'Programma terminato con codice non zero', TIMEOUT: 'Tempo limite raggiunto', STOPPED: 'Arrestato', ERROR: 'Errore della toolchain', BLOCKED: 'Toolchain non disponibile' };
    const warningCount = result.diagnosticEntries?.filter(d => d.severity === 'warning').length || 0;
    status.textContent = `${labels[result.status] || result.status}${warningCount ? ' | ' + warningCount + ' warning' : ''}${result.exitCode != null ? ' | exit ' + result.exitCode : ''}${result.ms ? ' | ' + Math.round(result.ms) + ' ms' : ''}`;
  } catch (error) { runtime.textContent = plainLog(error.stack || error); }
  finally { busy(false); document.querySelector('#stop').disabled = true; controller = undefined; }
};
document.querySelector('#stop').onclick = () => controller?.abort();
document.querySelector('#run').onclick = async () => {
  busy(true);
  lastReport = undefined;
  document.querySelector('#export').disabled = true;
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
  busy(true);
  try {
    status.textContent = 'Acquisizione cache locale in corso…';
    const result = await prepareOffline(document.querySelector('#engine').value);
    status.textContent = result.message;
  } catch (error) { status.textContent = String(error); }
  finally { busy(false); }
};
