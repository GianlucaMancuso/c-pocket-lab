/* One fresh worker per test: releases compiler/runtime memory; termination handles loops. */
let canvas, ctx2d;
async function readLocal(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Asset locale mancante: ${path} (${response.status})`);
  return response.arrayBuffer();
}
async function browsercc(test) {
  const { compile } = await import('./vendor/browsercc/dist/index.js');
  const { WASI, File, OpenFile, PreopenDirectory, ConsoleStdout } =
    await import('./vendor/wasi/dist/index.js');
  const result = await compile({ source: test.source, fileName: 'main.c', flags: ['-x', 'c', '-std=c11', '-O0'] });
  if (!result.module) return { compileError: true, diagnostics: result.compileOutput };
  self.postMessage({ phase: 'execute' });
  let stdout = '', stderr = '';
  const outDecoder = new TextDecoder(), errDecoder = new TextDecoder();
  const root = new PreopenDirectory('.', new Map());
  const wasi = new WASI(['main.wasm'], [], [
    new OpenFile(new File(new TextEncoder().encode(test.stdin || ''))),
    new ConsoleStdout(bytes => { stdout += outDecoder.decode(bytes, { stream: true }); }),
    new ConsoleStdout(bytes => { stderr += errDecoder.decode(bytes, { stream: true }); }), root
  ]);
  const instance = await WebAssembly.instantiate(result.module, { wasi_snapshot_preview1: wasi.wasiImport });
  const exitCode = wasi.start(instance);
  stdout += outDecoder.decode(); stderr += errDecoder.decode();
  const files = {};
  for (const name of Object.keys(test.files || {})) {
    const file = root.dir.contents.get(name);
    files[name] = file ? new TextDecoder().decode(file.data) : null;
  }
  return { stdout, stderr, exitCode, files, diagnostics: result.compileOutput };
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
    hostWrite: s => { output += s; }
  });
  await api.ready;
  api.memfs.addFile('main.c', test.source);
  const clang = await api.getModule(base + 'clang');
  try {
    await api.run(clang, 'clang', '-cc1', '-emit-obj',
      ...api.clangCommonArgs, '-O0', '-o', 'main.o', '-x', 'c', '-std=c11', 'main.c');
    await api.link('main.o', 'main.wasm');
  } catch (error) {
    if (test.compileError && Number.isInteger(error.code) && error.code !== 0)
      return { compileError: true, diagnostics: output + String(error) };
    throw error;
  }
  const module = await WebAssembly.compile(api.memfs.getFileContents('main.wasm'));
  api.memfs.setStdinStr(test.stdin || '');
  self.postMessage({ phase: 'execute' });
  let stdout = '', exitCode = 0;
  api.memfs.hostWrite = s => { stdout += s; };
  const exited = {};
  class TestApp extends API.App {
    proc_exit(code) { exitCode = code; throw exited; }
  }
  const app = new TestApp(module, api.memfs, 'main.wasm');
  await app.ready;
  try { app.exports._start(); } catch (error) { if (error !== exited) throw error; }
  const files = {};
  for (const name of Object.keys(test.files || {})) {
    files[name] = new TextDecoder().decode(api.memfs.getFileContents(name));
  }
  return { stdout, stderr: '', exitCode, files, diagnostics: output };
}
self.onmessage = async ({ data: { engine, test } }) => {
  try {
    const start = performance.now();
    const result = await (engine === 'binji' ? binji(test) : browsercc(test));
    self.postMessage({ done: true, result: { ...result, ms: performance.now() - start } });
  } catch (error) { self.postMessage({ done: true, error: String(error.stack || error) }); }
};
