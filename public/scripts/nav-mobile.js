/*
 * Navegação do celular: barra inferior com 4 atalhos + "Mais" (folha com o resto do menu).
 * No desktop nada muda: a lista completa continua na lateral.
 *
 * Funciona com os dois menus do sistema (estático: ul.menu; injetado por sidebar.js: ul.nl-menu).
 * Se o menu ainda não existe (sidebar.js o cria no DOMContentLoaded), espera por ele.
 */
(function () {
  'use strict';

  var PRIMARIOS = ['/home', '/diario', '/rotulos', '/chat'];
  var CSS =
    '.nl-mais-li{display:none}' +
    '.nl-mais-folha,.nl-mais-fundo{display:none}' +
    '@media (max-width:768px){' +
      'html body .sidebar .menu a span,html body .nl-sidebar .nl-menu a span{display:block;font-size:.66rem;font-weight:700;margin-top:3px;line-height:1;white-space:nowrap}' +
      'html body .sidebar .menu a,html body .nl-sidebar .nl-menu a{flex-direction:column}' +
      '.nl-secundario{display:none!important}' +
      '.nl-mais-li{display:flex;flex:1}' +
      '.nl-mais-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:7px 4px;border:0;border-radius:14px;background:transparent;color:var(--nl-ink-500,#64748b);font:inherit;cursor:pointer}' +
      '.nl-mais-btn i{font-size:1.5rem}' +
      '.nl-mais-btn span{display:block;font-size:.66rem;font-weight:700;margin-top:3px;line-height:1}' +
      '.nl-mais-btn.ativo,.nl-mais-btn[aria-expanded="true"]{background:var(--nl-emerald-100,#d1fae5);color:var(--nl-emerald-800,#065f46)}' +
      '.nl-mais-fundo{position:fixed;inset:0;z-index:990;background:rgba(15,23,42,.45);display:block;opacity:0;pointer-events:none;transition:opacity .2s}' +
      '.nl-mais-fundo.aberto{opacity:1;pointer-events:auto}' +
      '.nl-mais-folha{position:fixed;left:0;right:0;bottom:0;z-index:995;display:block;background:#fff;border-radius:22px 22px 0 0;padding:10px 16px calc(84px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(15,23,42,.25);transform:translateY(105%);transition:transform .25s ease;max-height:80vh;overflow:auto}' +
      '.nl-mais-folha.aberta{transform:none}' +
      '.nl-mais-alca{width:44px;height:5px;border-radius:5px;background:#cbd5e1;margin:0 auto 12px}' +
      '.nl-mais-folha h2{margin:0 0 8px;font:800 1rem system-ui,sans-serif;color:var(--nl-ink-900,#0f172a)}' +
      '.nl-mais-grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}' +
      '.nl-mais-grade a,.nl-mais-grade button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:84px;padding:10px 6px;border:1px solid var(--nl-line,#e2e8f0);border-radius:16px;background:var(--nl-bg,#f8fafc);color:var(--nl-ink-800,#1e293b);text-decoration:none;font:700 .78rem system-ui,sans-serif;text-align:center;cursor:pointer}' +
      '.nl-mais-grade i{font-size:1.6rem;color:var(--nl-emerald-700,#047857)}' +
      '.nl-mais-grade a.atual{background:var(--nl-emerald-100,#d1fae5);border-color:var(--nl-emerald-200,#a7f3d0)}' +
      '.nl-mais-grade .sair i{color:#b91c1c}' +
    '}';

  function caminhoDe(a) {
    try { return new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch (_) { return ''; }
  }

  function montar(menu) {
    if (menu.getAttribute('data-nl-mais')) return;
    menu.setAttribute('data-nl-mais', '1');

    if (!document.getElementById('nl-mais-css')) {
      var st = document.createElement('style');
      st.id = 'nl-mais-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    var atual = location.pathname.replace(/\/+$/, '') || '/';
    var secundarios = [];
    Array.prototype.forEach.call(menu.querySelectorAll('li'), function (li) {
      var a = li.querySelector('a');
      if (!a) return;
      var caminho = caminhoDe(a);
      if (PRIMARIOS.indexOf(caminho) === -1) {
        li.classList.add('nl-secundario');
        secundarios.push({ href: a.getAttribute('href'), icone: a.querySelector('i') ? a.querySelector('i').className : 'bx bx-circle', texto: (a.querySelector('span') || a).textContent.trim(), atual: caminho === atual });
      }
    });
    if (!secundarios.length) return;

    var li = document.createElement('li');
    li.className = 'nl-mais-li';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nl-mais-btn' + (secundarios.some(function (s) { return s.atual; }) ? ' ativo' : '');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = "<i class='bx bx-dots-horizontal-rounded'></i><span>Mais</span>";
    li.appendChild(btn);
    menu.appendChild(li);

    var fundo = document.createElement('div');
    fundo.className = 'nl-mais-fundo';
    var folha = document.createElement('div');
    folha.className = 'nl-mais-folha';
    folha.setAttribute('role', 'dialog');
    folha.setAttribute('aria-label', 'Mais opções');
    var grade = secundarios.map(function (s) {
      var a = document.createElement('a');
      a.href = s.href;
      if (s.atual) a.className = 'atual';
      var i = document.createElement('i');
      i.className = s.icone;
      var t = document.createElement('span');
      t.textContent = s.texto;
      a.appendChild(i);
      a.appendChild(t);
      return a;
    });
    var sair = document.createElement('button');
    sair.type = 'button';
    sair.className = 'sair';
    sair.innerHTML = "<i class='bx bx-log-out'></i><span>Sair</span>";
    sair.addEventListener('click', function () {
      if (confirm('Sair da conta?')) {
        try { localStorage.removeItem('token'); } catch (_) { /* segue para o login */ }
        location.href = '/login';
      }
    });

    folha.innerHTML = '<div class="nl-mais-alca"></div><h2>Mais</h2>';
    var caixa = document.createElement('div');
    caixa.className = 'nl-mais-grade';
    grade.forEach(function (a) { caixa.appendChild(a); });
    caixa.appendChild(sair);
    folha.appendChild(caixa);
    document.body.appendChild(fundo);
    document.body.appendChild(folha);

    function alternar(abrir) {
      fundo.classList.toggle('aberto', abrir);
      folha.classList.toggle('aberta', abrir);
      btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { alternar(!folha.classList.contains('aberta')); });
    fundo.addEventListener('click', function () { alternar(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') alternar(false); });
  }

  function procurar() {
    var menus = document.querySelectorAll('ul.menu, ul.nl-menu');
    Array.prototype.forEach.call(menus, montar);
    return menus.length > 0;
  }

  function iniciar() {
    if (procurar()) return;
    var obs = new MutationObserver(function () { if (procurar()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
