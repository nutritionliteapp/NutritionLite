/*
 * PWA: registra o service worker e oferece "Instalar o app" (uma vez a cada 14 dias).
 * Em localhost o service worker fica desligado (evita cache velho durante o desenvolvimento);
 * para testar lá: localStorage.setItem('nl-pwa', '1') e recarregar.
 */
(function () {
  'use strict';

  function lerLS(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function gravarLS(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* opcional */ } }

  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ('serviceWorker' in navigator && (!local || lerLS('nl-pwa') === '1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* sem PWA, o site segue normal */ });
    });
  }

  var evento = null;
  var PAUSA_MS = 14 * 24 * 3600 * 1000;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    evento = e;
    var ate = Number(lerLS('nl-instalar-ate') || 0);
    if (Date.now() < ate) return;
    mostrarFaixa();
  });

  window.addEventListener('appinstalled', function () {
    var faixa = document.getElementById('nl-instalar');
    if (faixa) faixa.remove();
    evento = null;
  });

  function mostrarFaixa() {
    if (document.getElementById('nl-instalar')) return;
    var st = document.createElement('style');
    st.textContent =
      '#nl-instalar{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:900;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid #a7f3d0;border-radius:16px;box-shadow:0 12px 30px rgba(6,78,59,.22);font:600 .9rem system-ui,sans-serif;color:#1e293b}' +
      '#nl-instalar img{width:38px;height:38px;border-radius:10px}' +
      '#nl-instalar span{flex:1;line-height:1.3}' +
      '#nl-instalar button{border:0;border-radius:10px;padding:9px 14px;font:700 .85rem system-ui,sans-serif;cursor:pointer}' +
      '#nl-instalar .sim{background:#047857;color:#fff}' +
      '#nl-instalar .nao{background:transparent;color:#64748b;padding:9px 8px}' +
      '@media (min-width:769px){#nl-instalar{left:auto;right:20px;bottom:20px;max-width:380px}}';
    document.head.appendChild(st);

    var faixa = document.createElement('div');
    faixa.id = 'nl-instalar';
    faixa.setAttribute('role', 'dialog');
    faixa.setAttribute('aria-label', 'Instalar o aplicativo');
    var img = document.createElement('img');
    img.src = '/icons/icon-192.png';
    img.alt = '';
    var txt = document.createElement('span');
    txt.textContent = 'Instale o NutritionLite na tela inicial e abra como um app.';
    var sim = document.createElement('button');
    sim.type = 'button';
    sim.className = 'sim';
    sim.textContent = 'Instalar';
    var nao = document.createElement('button');
    nao.type = 'button';
    nao.className = 'nao';
    nao.textContent = 'Agora não';

    sim.addEventListener('click', function () {
      if (!evento) return;
      evento.prompt();
      evento.userChoice.finally(function () { faixa.remove(); evento = null; });
    });
    nao.addEventListener('click', function () {
      gravarLS('nl-instalar-ate', String(Date.now() + PAUSA_MS));
      faixa.remove();
    });

    faixa.appendChild(img);
    faixa.appendChild(txt);
    faixa.appendChild(sim);
    faixa.appendChild(nao);
    document.body.appendChild(faixa);
  }
})();
