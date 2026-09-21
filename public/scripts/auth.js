/*
 * Sessão expirada: o JWT dura 1 h. Se uma chamada autenticada à API voltar 401,
 * limpa o token e leva o usuário ao login em vez de deixar a página travada.
 *
 * Incluir no <head> das páginas que exigem login. Só age em requisições /api/ que enviam
 * Authorization (o 401 do próprio login, sem token, não é afetado).
 */
(function () {
  'use strict';

  var fetchOriginal = window.fetch;
  if (typeof fetchOriginal !== 'function') return;

  function temAuthorization(init) {
    var headers = init && init.headers;
    if (!headers) return false;
    if (typeof headers.has === 'function') return headers.has('Authorization');
    return Object.keys(headers).some(function (k) {
      return k.toLowerCase() === 'authorization';
    });
  }

  window.fetch = function (input, init) {
    return fetchOriginal.apply(this, arguments).then(function (res) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (res.status === 401 && /\/api\//.test(url) && temAuthorization(init)) {
          try {
            localStorage.removeItem('token');
          } catch (_) { /* sem storage: o redirect resolve */ }
          if (window.location.pathname !== '/login') {
            window.location.href = window.NLVoltar ? window.NLVoltar.urlLogin() : '/login';
          }
        }
      } catch (_) { /* nunca quebrar a requisição por causa deste helper */ }
      return res;
    });
  };
})();
