/*
 * Identidade visual do usuário logado, em todas as páginas:
 *  - foto de perfil (ou avatar com as iniciais, sem depender de imagens externas);
 *  - sessão deslizante: quem está usando o app ganha um token novo antes de o atual vencer,
 *    e as chamadas em andamento passam a usar o token novo automaticamente.
 *
 * Expõe window.NLAvatar { atualizar(dataUrl, nome), limpar(), iniciais(nome), avatarPadrao(nome) }.
 */
(function () {
  'use strict';

  if (window.NLAvatar) return;

  var CHAVE = 'nl-visual';
  var VALIDADE_MS = 10 * 60 * 1000;
  var RENOVAR_QUANDO_FALTAR_MS = 25 * 60 * 1000;

  function lerLS(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function gravarLS(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* opcional */ } }
  function apagarLS(k) { try { localStorage.removeItem(k); } catch (_) { /* opcional */ } }

  function payload(token) {
    try {
      var b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b));
    } catch (_) { return null; }
  }
  function tokenValido(token) {
    var p = token && payload(token);
    return !!p && (!p.exp || p.exp * 1000 > Date.now());
  }

  var token = lerLS('token');
  if (!tokenValido(token)) {
    apagarLS(CHAVE); // saiu da conta (ou a sessão venceu): a foto guardada neste aparelho não fica para trás
    return;
  }
  var usuarioId = (payload(token) || {}).id;

  /* ---------- Avatar ---------- */

  function iniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    var a = partes[0].charAt(0);
    var b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }

  function avatarPadrao(nome) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ff0bd"/><stop offset="1" stop-color="#3fce85"/></linearGradient></defs>' +
      '<rect width="96" height="96" fill="url(#g)"/>' +
      '<text x="48" y="48" dy=".35em" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="38" font-weight="800" fill="#053b26">' +
      iniciais(nome).replace(/[<>&"]/g, '') + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var estado = { nome: '', foto: null };

  function lerCache() {
    try {
      var c = JSON.parse(lerLS(CHAVE) || 'null');
      if (c && c.uid === usuarioId && Date.now() - c.ts < VALIDADE_MS) return c;
    } catch (_) { /* cache corrompido */ }
    return null;
  }
  function gravarCache() {
    gravarLS(CHAVE, JSON.stringify({ uid: usuarioId, nome: estado.nome, foto: estado.foto, ts: Date.now() }));
  }

  var SELETORES = '.nl-avatar, .mini-avatar img, .profile-avatar-large img, .profile-photo, img[data-avatar]';

  function aplicar() {
    var src = estado.foto || avatarPadrao(estado.nome);
    Array.prototype.forEach.call(document.querySelectorAll(SELETORES), function (img) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.setAttribute('alt', estado.foto ? 'Sua foto de perfil' : 'Avatar com as suas iniciais');
      img.style.objectFit = 'cover';
    });
    var nomes = document.querySelectorAll('[data-nome-usuario]');
    Array.prototype.forEach.call(nomes, function (n) { if (estado.nome) n.textContent = estado.nome; });
  }

  function blobParaDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function carregar() {
    var cache = lerCache();
    if (cache) {
      estado.nome = cache.nome || '';
      estado.foto = cache.foto || null;
      aplicar();
      return;
    }
    var h = { Authorization: 'Bearer ' + lerLS('token') };
    var pFoto = fetch('/api/usuarios/foto', { headers: h })
      .then(function (r) { return r.ok ? r.blob().then(blobParaDataUrl) : null; })
      .catch(function () { return null; });
    var pNome = fetch('/api/usuarios/dashboard', { headers: h })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { return d.nome || ''; })
      .catch(function () { return ''; });
    Promise.all([pFoto, pNome]).then(function (r) {
      estado.foto = r[0];
      estado.nome = r[1];
      gravarCache();
      aplicar();
    });
  }

  window.NLAvatar = {
    iniciais: iniciais,
    avatarPadrao: avatarPadrao,
    atualizar: function (dataUrl, nome) {
      estado.foto = dataUrl || null;
      if (nome) estado.nome = nome;
      gravarCache();
      aplicar();
    },
    limpar: function () {
      estado.foto = null;
      gravarCache();
      aplicar();
    },
  };

  function iniciarAvatar() {
    carregar();
    // O menu lateral é injetado depois do carregamento: reaplica por alguns segundos.
    var obs = new MutationObserver(function () { aplicar(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 4000);
  }

  /* ---------- Sessão deslizante ---------- */

  var fetchOriginal = window.fetch;
  if (typeof fetchOriginal === 'function') {
    // Requisições feitas com o token antigo (guardado numa variável da página) passam a usar o mais novo.
    window.fetch = function (input, init) {
      try {
        var atual = lerLS('token');
        if (init && init.headers && atual) {
          var h = init.headers;
          if (typeof h.get === 'function') {
            var v = h.get('Authorization');
            if (v && v !== 'Bearer ' + atual && tokenValido(atual)) h.set('Authorization', 'Bearer ' + atual);
          } else if (h.Authorization && h.Authorization !== 'Bearer ' + atual && tokenValido(atual)) {
            init = Object.assign({}, init, { headers: Object.assign({}, h, { Authorization: 'Bearer ' + atual }) });
          }
        }
      } catch (_) { /* nunca quebrar a requisição */ }
      return fetchOriginal.call(this, input, init);
    };
  }

  var renovando = false;
  function renovarSeNecessario() {
    var atual = lerLS('token');
    var p = atual && payload(atual);
    if (!p || !p.exp || renovando || document.hidden) return;
    var falta = p.exp * 1000 - Date.now();
    if (falta <= 0 || falta > RENOVAR_QUANDO_FALTAR_MS) return;
    renovando = true;
    fetchOriginal('/api/usuarios/renovar', { method: 'POST', headers: { Authorization: 'Bearer ' + atual } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.token && tokenValido(d.token)) gravarLS('token', d.token); })
      .catch(function () { /* tenta de novo no próximo ciclo */ })
      .then(function () { renovando = false; });
  }

  setInterval(renovarSeNecessario, 60 * 1000);
  document.addEventListener('visibilitychange', renovarSeNecessario);
  renovarSeNecessario();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarAvatar);
  else iniciarAvatar();
})();
