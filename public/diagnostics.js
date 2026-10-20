// Keep the compiler's own wording, source excerpts and caret alignment intact.
export function plainLog(value = '') {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n/g, '\n');
}

export function diagnosticEntries(log) {
  const entries = [];
  for (const line of plainLog(log).split('\n')) {
    const match = line.match(/^(.+?):(\d+):(\d+): (warning|error|fatal error|note): (.*)$/);
    if (match) entries.push({ file: match[1], line: Number(match[2]), column: Number(match[3]),
      severity: match[4], message: match[5], option: match[5].match(/\[(-W[^\]]+)\]$/)?.[1] || null });
  }
  return entries;
}

export function runtimeExplanation(error) {
  if (!error) return '';
  const message = String(error.message || error);
  if (/divide by zero|division by zero/i.test(message))
    return 'WebAssembly ha interrotto una divisione intera per zero.';
  if (/out of bounds|outside.*bounds/i.test(message))
    return 'Accesso oltre la memoria lineare WebAssembly. Non tutti gli accessi fuori da un array C producono questo errore.';
  if (/unreachable/i.test(message))
    return 'Il programma ha eseguito una istruzione trap. Questo messaggio da solo non identifica la causa nel codice C.';
  return 'Esecuzione interrotta. Il messaggio e lo stack originali sono riportati sotto.';
}
