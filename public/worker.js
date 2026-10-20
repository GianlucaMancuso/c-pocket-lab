/* One fresh worker per test: releases compiler/runtime memory; termination handles loops. */
let canvas, ctx2d;
const warnings = ['-Wall', '-Wextra', '-Wpedantic', '-Wformat=2', '-fdiagnostics-show-option'];
let lastDiagnostics = '';
let stage = 'load';
function debugSections(module) {
  const bytes = name => WebAssembly.Module.customSections(module, name).reduce((n, s) => n + s.byteLength, 0);
  return { infoBytes: bytes('.debug_info'), lineBytes: bytes('.debug_line'), nameBytes: bytes('name') };
}
function runtimeFailure(error) {
  return { name: error.name || 'Error', message: error.message || String(error), stack: String(error.stack || error) };
}
async function readLocal(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Asset locale mancante: ${path} (${response.status})`);
  return response.arrayBuffer();
}
async function browsercc(test) {
  const { compile } = await import('./vendor/browsercc/dist/index.js');
  const { WASI, File, OpenFile, PreopenDirectory, ConsoleStdout } =
    await import('./vendor/wasi/dist/index.js');
  const flags = ['-x', 'c', '-std=c11', '-O0', '-g', ...warnings, '-fno-color-diagnostics', '-fmessage-length=0'];
  if (test.probe === 'asan') flags.push('-fsanitize=address');
  if (test.probe === 'ubsan') flags.push('-fsanitize=undefined');
  if (test.probe === 'ubsan-trap') flags.push('-fsanitize=undefined', '-fsanitize-trap=all');
  const command = `$ clang ${flags.join(' ')} main.c -o main.wasm\n`;
  stage = 'compile';
  lastDiagnostics = command;
  // Upstream throws driver failures after writing their diagnostics to console.error.
  // Preserve that text as part of the compiler log in this isolated worker.
  let result, driverDiagnostics = '';
  const originalConsoleError = console.error;
  console.error = (...messages) => { driverDiagnostics += messages.join(' ') + '\n'; };
  try { result = await compile({ source: test.source, fileName: 'main.c', flags }); }
  catch (error) {
    lastDiagnostics = command + driverDiagnostics;
    if (/Clang driver failed with code/.test(error.message))
      return { compileError: true, stage: 'driver', diagnostics: lastDiagnostics };
    throw error;
  } finally { console.error = originalConsoleError; }
  result.compileOutput = command + result.compileOutput;
  lastDiagnostics = result.compileOutput;
  if (!result.module) return { compileError: true, diagnostics: result.compileOutput };
  self.postMessage({ phase: 'execute' });
  stage = 'execute';
  let stdout = '', stderr = '';
  const outDecoder = new TextDecoder(), errDecoder = new TextDecoder();
  const root = new PreopenDirectory('.', new Map());
  const wasi = new WASI(['main.wasm'], [], [
    new OpenFile(new File(new TextEncoder().encode(test.stdin || ''))),
    new ConsoleStdout(bytes => { stdout += outDecoder.decode(bytes, { stream: true }); }),
    new ConsoleStdout(bytes => { stderr += errDecoder.decode(bytes, { stream: true }); }), root
  ]);
  const instance = await WebAssembly.instantiate(result.module, { wasi_snapshot_preview1: wasi.wasiImport });
  let exitCode = null, runtimeError;
  try { exitCode = wasi.start(instance); } catch (error) { runtimeError = runtimeFailure(error); }
  stdout += outDecoder.decode(); stderr += errDecoder.decode();
  const files = {};
  for (const name of Object.keys(test.files || {})) {
    const file = root.dir.contents.get(name);
    files[name] = file ? new TextDecoder().decode(file.data) : null;
  }
  return { stdout, stderr, exitCode, files, runtimeError, debug: debugSections(result.module), diagnostics: result.compileOutput };
}
async function binji(test) {
  // Upstream is a classic script. Its API is a global lexical binding.
  importScripts('./vendor/binji/shared.js');
  let output = '';
  const base = './vendor/binji/';
  const api = new API({
    clang: base + 'clang', lld: base + 'lld', memfs: base + 'memfs', sysroot: base + 'sysroot.tar',
    readBuffer: readLocal,
    compileStreaming: async path => WebAssembly.compile(await readLocal(path)),
    hostWrite: s => { output += s; lastDiagnostics = output; }
  });
  await api.ready;
  api.memfs.addFile('main.c', test.source);
  const clang = await api.getModule(base + 'clang');
  const flags = [...api.clangCommonArgs.filter(a => a !== '-fcolor-diagnostics'),
    '-O0', ...warnings, '-fmessage-length', '0', '-debug-info-kind=limited', '-dwarf-version=4', '-dwarf-column-info'];
  const undefinedChecks = 'signed-integer-overflow,integer-divide-by-zero,shift-base,shift-exponent,null,alignment,array-bounds';
  if (test.probe === 'asan') flags.push('-fsanitize=address');
  if (test.probe === 'ubsan') flags.push(`-fsanitize=${undefinedChecks}`);
  if (test.probe === 'ubsan-trap') flags.push(`-fsanitize=${undefinedChecks}`, `-fsanitize-trap=${undefinedChecks}`);
  stage = 'compile';
  try {
    await api.run(clang, 'clang', '-cc1', '-emit-obj',
      ...flags, '-o', 'main.o', '-x', 'c', '-std=c11', 'main.c');
    stage = 'link';
    await api.link('main.o', 'main.wasm');
  } catch (error) {
    if (Number.isInteger(error.code) && error.code !== 0)
      return { compileError: true, stage, diagnostics: output };
    throw error;
  }
  const module = await WebAssembly.compile(api.memfs.getFileContents('main.wasm'));
  api.memfs.setStdinStr(test.stdin || '');
  self.postMessage({ phase: 'execute' });
  stage = 'execute';
  let stdout = '', exitCode = 0, runtimeError;
  api.memfs.hostWrite = s => { stdout += s; };
  const exited = {};
  class TestApp extends API.App {
    proc_exit(code) { exitCode = code; throw exited; }
  }
  const app = new TestApp(module, api.memfs, 'main.wasm');
  await app.ready;
  try { app.exports._start(); } catch (error) {
    if (error !== exited) { exitCode = null; runtimeError = runtimeFailure(error); }
  }
  const files = {};
  for (const name of Object.keys(test.files || {})) {
    files[name] = new TextDecoder().decode(api.memfs.getFileContents(name));
  }
  return { stdout, stderr: '', exitCode, files, runtimeError, debug: debugSections(module), diagnostics: output };
}
self.onmessage = async ({ data: { engine, test } }) => {
  let plainLog = value => String(value || '');
  try {
    const diagnostics = await import('./diagnostics.js');
    plainLog = diagnostics.plainLog;
    const start = performance.now();
    const result = await (engine === 'binji' ? binji(test) : browsercc(test));
    result.diagnostics = plainLog(result.diagnostics);
    self.postMessage({ done: true, result: { ...result, diagnosticEntries: diagnostics.diagnosticEntries(result.diagnostics), ms: performance.now() - start } });
  } catch (error) { self.postMessage({ done: true, error: plainLog(error.stack || error), stage, diagnostics: plainLog(lastDiagnostics) }); }
};
