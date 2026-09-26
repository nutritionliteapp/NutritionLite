/* Salus puxa conversa: para quem está logado, acrescenta uma dica do dia (por regra, sem IA) abaixo da saudação. */
(function () {
  'use strict';

  function iniciar() {
    var sessao = window.NLSession;
    var container = document.getElementById('chat-container');
    if (!sessao || !sessao.logado() || !container) return;

    fetch('/api/diario/dica', { headers: { Authorization: 'Bearer ' + sessao.token() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.dica || container.querySelector('.salus-dica-msg')) return;

        var msg = document.createElement('div');
        msg.className = 'message assistant-message salus-dica-msg';

        var avatar = document.createElement('div');
        avatar.className = 'avatar';
        var img = document.createElement('img');
        img.src = '/imgs/logos/logo com borda.png';
        img.alt = 'NutritionLite';
        img.style.cssText = 'width:36px;height:36px;object-fit:cover;border-radius:50%';
        avatar.appendChild(img);

        var conteudo = document.createElement('div');
        conteudo.className = 'message-content';
        var titulo = document.createElement('p');
        var forte = document.createElement('strong');
        forte.textContent = 'Dica de hoje';
        titulo.appendChild(forte);
        var texto = document.createElement('p');
        texto.textContent = d.dica.texto;
        conteudo.appendChild(titulo);
        conteudo.appendChild(texto);

        if (d.dica.acao && d.dica.acao.href !== '/chat') {
          var link = document.createElement('a');
          link.href = d.dica.acao.href;
          link.textContent = d.dica.acao.texto + ' →';
          link.style.cssText = 'display:inline-block;margin-top:8px;font-weight:700;color:var(--nl-emerald-700)';
          conteudo.appendChild(link);
        }

        msg.appendChild(avatar);
        msg.appendChild(conteudo);
        container.appendChild(msg);
      })
      .catch(function () { /* sem dica, a conversa segue normal */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
