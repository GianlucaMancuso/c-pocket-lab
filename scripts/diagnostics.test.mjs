import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatRuntimeError } from '../public/diagnostics.js';

const report = JSON.parse(await readFile(new URL('../reports/iphone-preview-binji-offline.json', import.meta.url), 'utf8'));
for (const id of ['runtime-divide-zero', 'runtime-memory-bounds']) {
  test(`original Safari message and frames stay visible: ${id}`, () => {
    const error = report.results.find(result => result.id === id).runtimeError;
    assert.ok(!error.stack.includes(error.message), 'This fixture exercises a frames-only Safari stack');
    const log = formatRuntimeError(error);
    assert.ok(log.includes(`${error.name}: ${error.message}`));
    assert.ok(log.includes(error.stack));
    assert.ok(!log.includes('undefined'));
  });
}
test('a Chrome-style stack does not duplicate the heading', () => {
  const error = { name: 'RuntimeError', message: 'divide by zero', stack: 'RuntimeError: divide by zero\n    at main (wasm-function[1])' };
  const log = formatRuntimeError(error);
  assert.equal(log.split('RuntimeError: divide by zero').length - 1, 1);
  assert.ok(log.includes(error.stack));
});
