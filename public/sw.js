/*
 * Service worker do NutritionLite (PWA).
 *
 *  - Arquivos estáticos (css/js/imagens/ícones): abre do cache e atualiza em segundo plano.
 *  - Páginas: rede primeiro; sem internet, mostra a última versão vista ou /offline.html.
 *  - Consulta da Tabela TACO (/api/alimentos/consulta): rede primeiro, com cache das buscas já feitas —
 *    assim o que você pesquisou continua disponível offline.
 *  - Todo o resto da API (login, diário, IA…) nunca é guardado: dados pessoais não ficam em cache.
 */
const VERSAO = 'nl-v1';
const CACHE_ESTATICO = `${VERSAO}-estatico`;
const CACHE_PAGINAS = `${VERSAO}-paginas`;
const CACHE_TACO = `${VERSAO}-taco`;
const MAX_TACO = 60;

const PRE_CACHE = ['/offline.html', '/css/tokens.css', '/icons/icon-192.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_ESTATICO).then((c) => c.addAll(PRE_CACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function limitar(nomeCache, max) {
  const cache = await caches.open(nomeCache);
  const chaves = await cache.keys();
  if (chaves.length > max) await Promise.all(chaves.slice(0, chaves.length - max).map((k) => cache.delete(k)));
}

async function redePrimeiro(req, nomeCache, fallback) {
  try {
    const resposta = await fetch(req);
    if (resposta && resposta.ok) {
      const cache = await caches.open(nomeCache);
      cache.put(req, resposta.clone());
      if (nomeCache === CACHE_TACO) limitar(CACHE_TACO, MAX_TACO);
    }
    return resposta;
  } catch (err) {
    const guardado = await caches.match(req);
    if (guardado) return guardado;
    if (fallback) return fallback();
    throw err;
  }
}

async function cacheEAtualiza(req) {
  const cache = await caches.open(CACHE_ESTATICO);
  const guardado = await cache.match(req);
  const rede = fetch(req)
    .then((resposta) => {
      if (resposta && resposta.ok) cache.put(req, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  return guardado || (await rede) || Response.error();
}

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/api/alimentos/consulta') {
    evento.respondWith(redePrimeiro(req, CACHE_TACO));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    evento.respondWith(
      redePrimeiro(req, CACHE_PAGINAS, async () => (await caches.match('/offline.html')) || Response.error())
    );
    return;
  }

  if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    evento.respondWith(cacheEAtualiza(req));
  }
});
