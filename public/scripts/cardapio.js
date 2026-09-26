/* Cardápio semanal — /cardapio. Sem innerHTML com dados: tudo entra por textContent. */
(function () {
  'use strict';

  var token = null;
  try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
  if (!token) {
    window.location.href = window.NLVoltar ? window.NLVoltar.urlLogin() : '/login';
    return;
  }

  window.fazerLogout = function () {
    if (confirm('Sair da conta?')) {
      try { localStorage.removeItem('token'); } catch (_) { /* segue */ }
      window.location.href = '/login';
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  var estado = { cardapio: null, dia: 0, marcados: {} };

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function moeda(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function num(n, c) {
    return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: c === undefined ? 0 : c });
  }
  function gramas(g) {
    return g >= 1000 ? num(g / 1000, 2) + ' kg' : num(g) + ' g';
  }

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    var headers = { Authorization: 'Bearer ' + token };
    if (opcoes.body) headers['Content-Type'] = 'application/json';
    return fetch(caminho, {
      method: opcoes.method || 'GET',
      headers: headers,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (corpo) {
        if (!res.ok) {
          var erro = new Error(corpo.mensagem || 'Erro ao falar com o servidor.');
          erro.status = res.status;
          throw erro;
        }
        return corpo;
      });
    });
  }

  function chaveMarcados() {
    return 'nl-compras-' + (estado.cardapio && estado.cardapio.gerado_em || '');
  }
  function lerMarcados() {
    try { return JSON.parse(localStorage.getItem(chaveMarcados()) || '{}') || {}; } catch (_) { return {}; }
  }
  function salvarMarcados() {
    try { localStorage.setItem(chaveMarcados(), JSON.stringify(estado.marcados)); } catch (_) { /* opcional */ }
  }

  function desenharDia() {
    var c = estado.cardapio;
    var dia = c.dias[estado.dia];
    var caixa = $('diaCard');
    caixa.textContent = '';

    var topo = el('div', 'dia-topo');
    topo.appendChild(el('h2', '', dia.dia));
    topo.appendChild(el('span', 'dia-total', num(dia.total.kcal) + ' kcal · P ' + num(dia.total.proteina, 0) + ' g · ' + moeda(dia.total.custo)));
    caixa.appendChild(topo);

    dia.refeicoes.forEach(function (ref) {
      var bloco = el('div', 'refeicao-bloco');
      var cab = el('div', 'refeicao-cab');
      cab.appendChild(el('h3', '', ref.nome));
      cab.appendChild(el('small', '', num(ref.total.kcal) + ' kcal'));
      bloco.appendChild(cab);
      var ul = el('ul', 'refeicao-itens');
      ref.itens.forEach(function (it) {
        var li = el('li');
        li.appendChild(el('span', '', it.alimento));
        li.appendChild(el('strong', '', num(it.quantidade_g) + ' g'));
        ul.appendChild(li);
      });
      bloco.appendChild(ul);
      caixa.appendChild(bloco);
    });
  }

  function desenharAbas() {
    var abas = $('abasDias');
    abas.textContent = '';
    estado.cardapio.dias.forEach(function (d, i) {
      var b = el('button', 'aba-dia' + (i === estado.dia ? ' ativa' : ''), d.dia.slice(0, 3));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === estado.dia ? 'true' : 'false');
      b.title = d.dia;
      b.addEventListener('click', function () { estado.dia = i; desenharAbas(); desenharDia(); });
      abas.appendChild(b);
    });
  }

  function textoLista() {
    var c = estado.cardapio;
    var linhas = ['Lista de compras — NutritionLite', ''];
    c.lista_compras.forEach(function (i) {
      linhas.push('• ' + i.alimento + ' — ' + gramas(i.quantidade_g) + (i.custo_estimado !== null ? ' (~' + moeda(i.custo_estimado) + ')' : ''));
    });
    linhas.push('', 'Total estimado: ' + moeda(c.total_semana.custo));
    return linhas.join('\n');
  }

  function desenharCompras() {
    var c = estado.cardapio;
    var ul = $('compras');
    ul.textContent = '';
    c.lista_compras.forEach(function (item, idx) {
      var li = el('li');
      var rotulo = el('label', 'compra-item');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!estado.marcados[idx];
      cb.addEventListener('change', function () {
        estado.marcados[idx] = cb.checked;
        salvarMarcados();
        li.classList.toggle('feito', cb.checked);
      });
      li.classList.toggle('feito', cb.checked);
      rotulo.appendChild(cb);
      rotulo.appendChild(el('span', 'compra-nome', item.alimento));
      rotulo.appendChild(el('span', 'compra-qtd', gramas(item.quantidade_g)));
      rotulo.appendChild(el('span', 'compra-preco', item.custo_estimado !== null ? moeda(item.custo_estimado) : '—'));
      li.appendChild(rotulo);
      ul.appendChild(li);
    });
    $('comprasTotal').textContent = 'Total estimado da semana: ' + moeda(c.total_semana.custo);
  }

  function desenhar(c) {
    estado.cardapio = c;
    estado.dia = 0;
    estado.marcados = lerMarcados();

    $('rCusto').textContent = moeda(c.total_semana.custo);
    $('rOrcamento').textContent = c.orcamento ? 'de ' + moeda(c.orcamento) : '';
    $('rKcal').textContent = num(c.media_diaria_kcal) + ' kcal';
    $('rMeta').textContent = c.meta_kcal ? 'meta: ' + num(c.meta_kcal) + ' kcal' : 'meta não calculada';

    var status = $('rStatus');
    var card = $('rStatusCard');
    card.classList.remove('ok', 'acima');
    if (c.dentro_do_orcamento === true) {
      status.textContent = 'Dentro';
      $('rStatusSub').textContent = 'Sobram ' + moeda(c.orcamento - c.total_semana.custo);
      card.classList.add('ok');
    } else if (c.dentro_do_orcamento === false) {
      status.textContent = 'Acima';
      $('rStatusSub').textContent = 'Passou ' + moeda(c.total_semana.custo - c.orcamento) + ' — gere de novo ou aumente o valor';
      card.classList.add('acima');
    } else {
      status.textContent = '—';
      $('rStatusSub').textContent = '';
    }

    desenharAbas();
    desenharDia();
    desenharCompras();

    var dicas = c.dicas || [];
    $('dicasCard').hidden = dicas.length === 0;
    var ulDicas = $('dicas');
    ulDicas.textContent = '';
    dicas.forEach(function (d) { ulDicas.appendChild(el('li', '', d)); });

    var aviso = c.aviso_precos || '';
    if (c.itens_sem_preco) aviso += ' ' + c.itens_sem_preco + ' item(ns) sem preço na base não entram na soma.';
    $('avisoPrecos').textContent = aviso;
    $('resultado').hidden = false;
  }

  function gerar(e) {
    e.preventDefault();
    var msg = $('msgForm');
    msg.className = 'msg';
    msg.textContent = '';
    var orcamento = Number($('orcamento').value);
    if (!isFinite(orcamento) || orcamento < 30 || orcamento > 5000) {
      msg.className = 'msg erro';
      msg.textContent = 'Informe um orçamento semanal entre R$ 30 e R$ 5.000.';
      return;
    }
    var refeicoes = Array.prototype.map.call(document.querySelectorAll('#opcoesRefeicao input:checked'), function (i) { return i.value; });
    if (!refeicoes.length) {
      msg.className = 'msg erro';
      msg.textContent = 'Marque pelo menos uma refeição.';
      return;
    }

    var btn = $('btnGerar');
    btn.disabled = true;
    $('msgCarregando').hidden = false;
    api('/api/cardapio/gerar', { method: 'POST', body: { orcamento: orcamento, refeicoes: refeicoes, restricoes: $('restricoes').value } })
      .then(function (r) {
        desenhar(r.cardapio);
        $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        msg.className = 'msg erro';
        msg.textContent = err.message;
      })
      .then(function () {
        btn.disabled = false;
        $('msgCarregando').hidden = true;
      });
  }

  $('formCardapio').addEventListener('submit', gerar);
  $('chipsOrcamento').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (b) $('orcamento').value = b.getAttribute('data-v');
  });

  $('btnCopiar').addEventListener('click', function () {
    var btn = $('btnCopiar');
    var texto = textoLista();
    var feito = function () {
      btn.textContent = 'Copiado!';
      setTimeout(function () { btn.textContent = ''; var i = document.createElement('i'); i.className = 'bx bx-copy'; btn.appendChild(i); btn.appendChild(document.createTextNode(' Copiar')); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(feito, function () {});
  });
  $('btnCompartilhar').addEventListener('click', function () {
    var texto = textoLista();
    if (navigator.share) navigator.share({ title: 'Lista de compras', text: texto }).catch(function () {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  });

  fetch('/api/usuarios/dashboard', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) {
      var h = document.querySelector('.mini-info h4');
      if (h && d.nome) h.textContent = d.nome;
    })
    .catch(function () { /* mantém "Usuário" */ });

  // Reabre o último cardápio gerado
  api('/api/cardapio/ultimo').then(function (r) { if (r.cardapio && r.cardapio.dias) desenhar(r.cardapio); }).catch(function () { /* sem cardápio anterior */ });
})();
