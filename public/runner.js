import { cases } from './tests/cases.js';
export function runCase(engine, test, { signal, onPhase = () => {} } = {}) {
  return new Promise(resolve => {
    const worker = new Worker('./worker.js');
    let executing = false;
    let timer;
    let finished = false;
    const onAbort = () => finish({ status: 'STOPPED', reason: 'Arrestato dall’utente' });
    const finish = result => { if (finished) return; finished = true;
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort); worker.terminate(); resolve({ id: test.id,
      source: test.source, stdin: test.stdin || '', expected: test.expected,
      expectedExitCode: test.exitCode || 0, ...result }); };
    const arm = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => finish({ status: test.manual ? 'TIMEOUT' : test.timeout && executing ? 'PASS' : 'FAIL', reason: executing ? 'execution timeout' : 'compiler timeout' }), ms);
    };
    arm(180000);
    worker.onerror = e => finish({ status: test.manual ? 'ERROR' : 'FAIL', reason: e.message });
    worker.onmessage = ({ data }) => {
      if (data.phase === 'execute') { executing = true; onPhase('execute'); arm(test.timeout ? 2000 : 15000); return; }
      if (!data.done) return;
      if (data.error) { finish({ status: test.manual ? 'ERROR' : 'BLOCKED', reason: data.error,
        diagnostics: data.diagnostics || '', stage: data.stage }); return; }
      const r = data.result;
      if (test.manual) {
        finish({ status: r.compileError ? 'COMPILE_ERROR' : r.runtimeError ? 'RUNTIME_ERROR' : r.exitCode === 0 ? 'OK' : 'EXIT', ...r });
        return;
      }
      let pass = test.compileError ? r.compileError === true : test.runtimeError ?
        Boolean(r.runtimeError) && r.stdout === test.expected :
        !test.timeout && !r.compileError && !r.runtimeError && r.stdout === test.expected && r.exitCode === (test.exitCode || 0) &&
        Object.entries(test.files || {}).every(([name, value]) => r.files?.[name] === value);
      if (test.diagnosticsPattern) pass &&= new RegExp(test.diagnosticsPattern).test(r.diagnostics || '');
      if (test.runtimePattern) pass &&= new RegExp(test.runtimePattern, 'i').test(r.runtimeError?.message || '');
      if (test.debugInfo) pass &&= r.debug?.infoBytes > 0 && r.debug?.lineBytes > 0;
      if (test.warningOption) pass &&= r.diagnosticEntries?.some(entry => entry.severity === 'warning' && entry.option?.startsWith(test.warningOption));
      finish({ status: pass ? 'PASS' : 'FAIL', ...r });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    onPhase('compile');
    worker.postMessage({ engine, test });
  });
}
export function runProgram(engine, source, stdin = '', options = {}) {
  return runCase(engine, { id: 'manual', source, stdin, manual: true }, options);
}
export async function runSuite(engine, report = () => {}) {
  const results = [];
  const onlineAtStart = navigator.onLine;
  // Different source on every run, including offline: demonstrates fresh compilation.
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const tests = cases.map(test => test.id === 'printf' ? { ...test,
    source: test.source.replace(',42)', `,${nonce})`), expected: `hello ${nonce}\n` } : test);
  for (const test of tests) { const result = await runCase(engine, test); results.push(result); report(result); }
  return { engine, build: 'study-diagnostics-v1.1', date: new Date().toISOString(), userAgent: navigator.userAgent,
    channel: document.querySelector('meta[name="c-pocket-channel"]')?.content || 'main', appUrl: location.href,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    online: navigator.onLine, onlineAtStart, results };
}
