// Use this page's own registration, even when a parent app already has a worker.
export async function prepareOffline(engine) {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker non disponibile: usare HTTPS o localhost.');
  const scope = new URL('./', import.meta.url).href;
  const registration = await navigator.serviceWorker.register(new URL('sw.js', scope), { scope });
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) throw new Error('Service worker non disponibile');
  if (worker.state !== 'activated') await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('Attivazione offline scaduta: ricaricare online.')); }, 60000);
    function changed() {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(timer); worker.removeEventListener('statechange', changed);
        if (worker.state === 'activated') resolve(); else reject(new Error('Installazione offline fallita'));
      }
    }
    worker.addEventListener('statechange', changed); changed();
  });
  if (registration.scope !== scope || worker.scriptURL !== new URL('sw.js', scope).href)
    throw new Error('Ambito service worker inatteso');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Preparazione offline scaduta: riprovare online.')); }, 300000);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); resolve(data); };
    worker.postMessage({ command: 'prepare', engine }, [channel.port2]);
  });
}
