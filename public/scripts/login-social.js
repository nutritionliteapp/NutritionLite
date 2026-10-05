/*
 * Entrar com Google / Facebook — lado da página.
 * Ao clicar, guarda para onde voltar (NLVoltar). Ao retornar do provedor, o servidor manda
 * /login#token=… (sucesso) ou /login?erro=social_… (falha); aqui isso vira sessão ou mensagem.
 */
(function () {
  'use strict';

  var CHAVE_VOLTAR = 'nl-voltar-social';
  var JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  var MENSAGENS = {
    social_cancelado: 'Login cancelado. Você pode tentar de novo quando quiser.',
    social_indisponivel: 'Esse tipo de login ainda não está disponível. Use seu e-mail e senha.',
    social_desconhecido: 'Esse tipo de login não existe.',
    social_estado: 'Não deu para confirmar o pedido de login. Tente de novo.',
    social_sem_email: 'Não recebemos seu e-mail do provedor. Permita o acesso ao e-mail ou entre com e-mail e senha.',
    social_email_nao_verificado: 'O e-mail dessa conta ainda não foi verificado no provedor.',
    social_falhou: 'Não foi possível entrar agora. Tente de novo em instantes.'
  };

  function guardar(chave, valor) { try { sessionStorage.setItem(chave, valor); } catch (_) { /* modo privado */ } }
  function ler(chave) { try { return sessionStorage.getItem(chave); } catch (_) { return null; } }
  function apagar(chave) { try { sessionStorage.removeItem(chave); } catch (_) { /* nada a fazer */ } }

  function destinoSeguro() {
    var salvo = ler(CHAVE_VOLTAR);
    apagar(CHAVE_VOLTAR);
    var permitidas = (window.NLVoltar && window.NLVoltar.PERMITIDAS) || [];
    return salvo && permitidas.indexOf(salvo) >= 0 ? salvo : '/home';
  }

  function mostrar(texto, classe) {
    var el = document.getElementById('msgLogin');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mensagem ' + classe;
  }

  function limparUrl(removerQuery) {
    try {
      var url = window.location.pathname;
      if (!removerQuery) url += window.location.search;
      window.history.replaceState(null, '', url);
    } catch (_) { /* sem history API */ }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-social]');
    if (!link) return;
    guardar(CHAVE_VOLTAR, window.NLVoltar ? window.NLVoltar.destino() : '/home');
  });

  document.addEventListener('DOMContentLoaded', function () {
    var hash = window.location.hash || '';
    if (hash.indexOf('#token=') === 0) {
      var token = decodeURIComponent(hash.slice(7));
      limparUrl(false);
      if (JWT.test(token)) {
        try { localStorage.setItem('token', token); } catch (_) { /* sem armazenamento */ }
        mostrar('Login bem-sucedido, você será redirecionado.', 'sucesso');
        var destino = destinoSeguro();
        setTimeout(function () { window.location.href = destino; }, 900);
      } else {
        mostrar(MENSAGENS.social_falhou, 'erro');
      }
      return;
    }

    var erro = new URLSearchParams(window.location.search).get('erro');
    if (erro && Object.prototype.hasOwnProperty.call(MENSAGENS, erro)) {
      mostrar(MENSAGENS[erro], 'erro');
      var params = new URLSearchParams(window.location.search);
      params.delete('erro');
      var resto = params.toString();
      try { window.history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '')); } catch (_) { /* ok */ }
    }
  });

  window.NLLoginSocial = { MENSAGENS: MENSAGENS };
})();
