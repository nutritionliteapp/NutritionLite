/*
 * "Voltar de onde parou" depois do login.
 *
 * Páginas que mandam o usuário para o login (visitante sem token, sessão expirada, cota do chat/TACO
 * esgotada) usam NLVoltar.urlLogin(): ele acrescenta ?voltar=/pagina-atual. A tela de login usa
 * NLVoltar.destino() para devolver o usuário à página de origem (ou ao início do logado).
 *
 * Só páginas da lista abaixo são aceitas: um ?voltar= arbitrário nunca vira redirecionamento aberto.
 */
(function () {
  'use strict';

  var PERMITIDAS = [
    '/chat',
    '/taco',
    '/noticias',
    '/home',
    '/dashboard',
    '/ficha',
    '/minhas-fichas',
    '/perfil',
    '/rotulos',
  ];
  var PADRAO = '/home';

  function normalizar(caminho) {
    return String(caminho || '').replace(/\/+$/, '') || '/';
  }

  /** '/login?voltar=/chat' quando a página atual é uma das permitidas; senão '/login'. */
  function urlLogin() {
    var atual = normalizar(window.location.pathname);
    return PERMITIDAS.indexOf(atual) >= 0
      ? '/login?voltar=' + encodeURIComponent(atual)
      : '/login';
  }

  /** Destino após o login: o ?voltar= da URL, se permitido; senão o /home. */
  function destino() {
    try {
      var voltar = normalizar(new URLSearchParams(window.location.search).get('voltar'));
      if (PERMITIDAS.indexOf(voltar) >= 0) return voltar;
    } catch (_) { /* URL sem query: usa o padrão */ }
    return PADRAO;
  }

  window.NLVoltar = { urlLogin: urlLogin, destino: destino, PERMITIDAS: PERMITIDAS };
})();
