/* Card "Seu dia" da home: calorias do dia + dica da Salus (endpoint sem IA, resposta instantânea). */
(function () {
  'use strict';

  var token = null;
  try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
  var card = document.getElementById('diaHome');
  if (!token || !card) return;

  fetch('/api/diario/dica', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.dica) return;
      document.getElementById('diaHomeDica').textContent = d.dica.texto;

      var p = d.progresso && d.progresso.kcal;
      var barra = document.getElementById('diaHomeBarra');
      if (p) {
        document.getElementById('diaHomeKcal').textContent = Math.round(p.feito).toLocaleString('pt-BR');
        document.getElementById('diaHomeMeta').textContent = 'de ' + Math.round(p.meta).toLocaleString('pt-BR') + ' kcal';
        barra.style.width = Math.min(100, p.pct || 0) + '%';
        barra.classList.toggle('acima', (p.pct || 0) > 115);
      } else {
        document.getElementById('diaHomeKcal').hidden = true;
        document.getElementById('diaHomeMeta').textContent = 'Metas ainda não calculadas';
        document.querySelector('.dia-home-trilho').hidden = true;
      }

      var acao = document.getElementById('diaHomeAcao');
      if (d.dica.acao) {
        acao.href = d.dica.acao.href;
        acao.textContent = d.dica.acao.texto;
      } else {
        acao.hidden = true;
      }
      card.hidden = false;
    })
    .catch(function () { /* sem o card, a home segue igual */ });
})();
