/*
 * Navegação do celular: barra inferior com 4 atalhos (o do meio, "Rótulos", vira botão de destaque)
 * + "Mais", uma folha com o resto do menu e o atalho para o perfil. O visual está em /css/nav-mobile.css.
 * No PC nada muda: a lista completa continua na lateral.
 *
 * Funciona com os dois menus do sistema (estático: ul.menu; injetado por sidebar.js: ul.nl-menu).
 * Se o menu ainda não existe (sidebar.js o cria no DOMContentLoaded), espera por ele.
 */
(function () {
  'use strict';

  var PRIMARIOS = ['/home', '/diario', '/rotulos', '/chat'];
  var BOTAO_CENTRAL = '/rotulos';

  function caminhoDe(a) {
    try { return new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch (_) { return ''; }
  }

  function vibrar() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) { /* sem suporte */ }
  }

  function garantirCss() {
    if (document.querySelector('link[href*="nav-mobile.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/nav-mobile.css';
    document.head.appendChild(link);
  }

  function dadosVisuais() {
    try {
      var c = JSON.parse(localStorage.getItem('nl-visual') || 'null');
      if (c) return { nome: c.nome || '', foto: c.foto || null };
    } catch (_) { /* cache ausente */ }
    return { nome: '', foto: null };
  }

  function montar(menu) {
    if (menu.getAttribute('data-nl-mais')) return;
    menu.setAttribute('data-nl-mais', '1');
    garantirCss();

    var atual = location.pathname.replace(/\/+$/, '') || '/';
    var secundarios = [];
    Array.prototype.forEach.call(menu.querySelectorAll('li'), function (li) {
      var a = li.querySelector('a');
      if (!a) return;
      var caminho = caminhoDe(a);
      a.addEventListener('click', vibrar);
      if (caminho === BOTAO_CENTRAL) li.classList.add('nl-fab');
      if (PRIMARIOS.indexOf(caminho) === -1) {
        li.classList.add('nl-secundario');
        secundarios.push({
          href: a.getAttribute('href'),
          caminho: caminho,
          icone: a.querySelector('i') ? a.querySelector('i').className : 'bx bx-circle',
          texto: (a.querySelector('span') || a).textContent.trim(),
          atual: caminho === atual,
        });
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
    var iconeBtn = document.createElement('i');
    iconeBtn.className = 'bx bx-grid-alt';
    var rotuloBtn = document.createElement('span');
    rotuloBtn.textContent = 'Mais';
    btn.appendChild(iconeBtn);
    btn.appendChild(rotuloBtn);
    li.appendChild(btn);
    menu.appendChild(li);

    var fundo = document.createElement('div');
    fundo.className = 'nl-mais-fundo';
    var folha = document.createElement('div');
    folha.className = 'nl-mais-folha';
    folha.setAttribute('role', 'dialog');
    folha.setAttribute('aria-label', 'Mais opções');

    var alca = document.createElement('div');
    alca.className = 'nl-mais-alca';
    folha.appendChild(alca);

    // Cartão do usuário (foto ou iniciais) que leva ao perfil
    var perfil = document.createElement('a');
    perfil.className = 'nl-mais-perfil';
    perfil.href = '/perfil';
    var foto = document.createElement('img');
    foto.alt = '';
    var textos = document.createElement('div');
    var nome = document.createElement('strong');
    var ver = document.createElement('small');
    ver.textContent = 'Ver e editar perfil';
    textos.appendChild(nome);
    textos.appendChild(ver);
    var seta = document.createElement('i');
    seta.className = 'bx bx-chevron-right';
    perfil.appendChild(foto);
    perfil.appendChild(textos);
    perfil.appendChild(seta);
    folha.appendChild(perfil);

    function atualizarPerfil() {
      var v = dadosVisuais();
      nome.textContent = v.nome || 'Minha conta';
      foto.src = v.foto || (window.NLAvatar ? window.NLAvatar.avatarPadrao(v.nome) : '/icons/avatar.svg');
    }

    var caixa = document.createElement('div');
    caixa.className = 'nl-mais-grade';
    secundarios.filter(function (s) { return s.caminho !== '/perfil'; }).forEach(function (s) {
      var a = document.createElement('a');
      a.href = s.href;
      if (s.atual) a.className = 'atual';
      var i = document.createElement('i');
      i.className = s.icone;
      var t = document.createElement('span');
      t.textContent = s.texto;
      a.appendChild(i);
      a.appendChild(t);
      a.addEventListener('click', vibrar);
      caixa.appendChild(a);
    });

    var sair = document.createElement('button');
    sair.type = 'button';
    sair.className = 'sair';
    var iconeSair = document.createElement('i');
    iconeSair.className = 'bx bx-log-out';
    var rotuloSair = document.createElement('span');
    rotuloSair.textContent = 'Sair';
    sair.appendChild(iconeSair);
    sair.appendChild(rotuloSair);
    sair.addEventListener('click', function () {
      if (confirm('Sair da conta?')) {
        try { localStorage.removeItem('token'); } catch (_) { /* segue para o login */ }
        location.href = '/login';
      }
    });
    caixa.appendChild(sair);
    folha.appendChild(caixa);

    document.body.appendChild(fundo);
    document.body.appendChild(folha);

    function alternar(abrir) {
      if (abrir) atualizarPerfil();
      fundo.classList.toggle('aberto', abrir);
      folha.classList.toggle('aberta', abrir);
      btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) vibrar();
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
