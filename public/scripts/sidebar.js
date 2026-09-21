/*
 * Navegação da página conforme o estado de login.
 *
 *  - Logado:   sidebar do usuário (mesmo visual do dashboard). A navbar pública da página,
 *              marcada com data-nav-publica, some.
 *  - Visitante: só nas páginas que optam com <script src="/scripts/sidebar.js" data-publica>,
 *              é injetada a navbar pública (Início / Serviços / Sobre / Contato / Entrar / Cadastre).
 *
 * Uso: incluir /css/sidebar.css e este script no <head>.
 * Também expõe window.NLSession ({ logado(), token() }) para o restante da página.
 */
(function () {
  'use strict';

  var querNavbarPublica = !!(document.currentScript && document.currentScript.hasAttribute('data-publica'));

  var ITENS = [
    { href: '/home', icone: 'bxs-home', texto: 'Início' },
    { href: '/dashboard', icone: 'bxs-bar-chart-alt-2', texto: 'Dashboard' },
    { href: '/noticias', icone: 'bx-food-menu', texto: 'Noticias' },
    { href: '/chat', icone: 'bx-bot', texto: 'Assistente IA' },
    { href: '/rotulos', icone: 'bx-scan', texto: 'Análise de Rótulos' },
    { href: '/taco', icone: 'bx-table', texto: 'Tabela Taco' },
    { href: '/perfil', icone: 'bx-user-circle', texto: 'Perfil' },
    { href: '/minhas-fichas', icone: 'bx-list-ul', texto: 'Minhas Fichas' },
  ];

  var AVATAR_PADRAO =
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=60';
  var BOXICONS = 'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css';

  function lerToken() {
    try {
      return localStorage.getItem('token');
    } catch (_) {
      return null;
    }
  }

  /** Logado = há token e ele ainda não expirou (o JWT dura 1 h). */
  function tokenAtivo(token) {
    if (!token) return false;
    try {
      var base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var payload = JSON.parse(atob(base64));
      return !payload.exp || payload.exp * 1000 > Date.now();
    } catch (_) {
      return false;
    }
  }

  var token = lerToken();
  var logado = tokenAtivo(token);

  window.NLSession = {
    logado: function () { return logado; },
    /** Token para enviar à API, ou null se não há sessão ativa. */
    token: function () { return logado ? token : null; },
  };

  function aoCarregar(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function garantirBoxicons() {
    if (document.querySelector('link[href*="boxicons"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = BOXICONS;
    document.head.appendChild(link);
  }

  function montarSidebar() {
    garantirBoxicons();

    var caminho = window.location.pathname.replace(/\/+$/, '') || '/';
    var links = ITENS.map(function (item) {
      var ativo = caminho === item.href ? ' class="active"' : '';
      return (
        '<li><a href="' + item.href + '"' + ativo + '>' +
        "<i class='bx " + item.icone + "'></i> <span>" + item.texto + '</span></a></li>'
      );
    }).join('');

    var aside = document.createElement('aside');
    aside.className = 'nl-sidebar';
    aside.setAttribute('aria-label', 'Menu principal');
    aside.innerHTML =
      '<div class="nl-top">' +
        '<a class="nl-brand" href="/home"><i class="bx bxs-leaf"></i><span>NutritionLite</span></a>' +
        '<div role="navigation"><ul class="nl-menu">' + links + '</ul></div>' +
      '</div>' +
      '<div class="nl-footer"><div class="nl-user">' +
        '<img class="nl-avatar" alt="Foto do usuário" src="' + AVATAR_PADRAO + '">' +
        '<span class="nl-user-name">Usuário</span>' +
        '<button type="button" class="nl-logout" title="Sair" aria-label="Sair">' +
          "<i class='bx bx-log-out'></i>" +
        '</button>' +
      '</div></div>';

    document.body.insertBefore(aside, document.body.firstChild);

    aside.querySelector('.nl-logout').addEventListener('click', function () {
      if (confirm('Sair da conta?')) {
        try {
          localStorage.removeItem('token');
        } catch (_) { /* sem storage: o redirect abaixo já resolve */ }
        window.location.href = '/login';
      }
    });

    // Nome do usuário (mesma API do dashboard). Se falhar, fica "Usuário".
    fetch('/api/usuarios/dashboard', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (dados) {
        if (dados && dados.nome) {
          aside.querySelector('.nl-user-name').textContent = dados.nome;
        }
      })
      .catch(function () { /* mantém o nome padrão */ });
  }

  function montarNavbarPublica() {
    var urlLogin = window.NLVoltar ? window.NLVoltar.urlLogin() : '/login'; // volta para cá depois de entrar
    var barra = document.createElement('div');
    barra.className = 'nl-topbar';
    barra.setAttribute('role', 'banner');
    barra.innerHTML =
      '<a class="nl-topbar-logo" href="/">' +
        '<img src="/imgs/logos/logo.png" alt="Logotipo NutritionLite">' +
        '<span>NutritionLite</span>' +
      '</a>' +
      '<div class="nl-topbar-nav" role="navigation" aria-label="Menu principal"><ul>' +
        '<li class="nl-topbar-link"><a href="/">Início</a></li>' +
        '<li class="nl-topbar-link"><a href="/#servicos">Serviços</a></li>' +
        '<li class="nl-topbar-link"><a href="/#sobre">Sobre</a></li>' +
        '<li class="nl-topbar-link"><a href="/#contato">Contato</a></li>' +
        '<li><a class="nl-btn nl-btn-outline" href="' + urlLogin + '">Entrar</a></li>' +
        '<li><a class="nl-btn nl-btn-fill" href="' + urlLogin + '">Cadastre</a></li>' +
      '</ul></div>';
    document.body.insertBefore(barra, document.body.firstChild);
  }

  if (logado) {
    // Cedo (ainda no <head>): esconde a navbar pública antes de ela ser desenhada.
    document.documentElement.classList.add('nl-logado');
    aoCarregar(montarSidebar);
  } else if (querNavbarPublica) {
    document.documentElement.classList.add('nl-anonimo');
    aoCarregar(montarNavbarPublica);
  }
})();
