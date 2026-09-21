/*
 * Dashboard (/dashboard): desenha os indicadores devolvidos por GET /api/dashboard/resumo.
 * Gráficos em SVG puro (sem biblioteca externa). Nada vindo do banco entra via innerHTML:
 * tudo usa textContent / atributos, então nomes de alimentos não executam código.
 *
 * A geometria dos gráficos são funções puras, exportadas para os testes (Node).
 */
(function () {
  'use strict';

  var COR = {
    proteina: '#059669',
    carboidratos: '#3fce85',
    gordura: '#d97706',
    barra: '#34d399',
    barraAtual: '#047857',
    trilho: '#e2e8f0',
    texto: '#475569',
  };

  var RAIO = 54;
  var CIRCUNFERENCIA = 2 * Math.PI * RAIO;

  /**
   * Segmentos do donut: comprimento e deslocamento de cada arco (stroke-dasharray/offset).
   * `folga` separa visualmente os arcos.
   */
  function calcularArcos(percentuais, circunferencia, folga) {
    var total = percentuais.reduce(function (a, b) { return a + b; }, 0) || 1;
    var acumulado = 0;
    return percentuais.map(function (p) {
      var fracao = p / total;
      var comprimento = Math.max(0, fracao * circunferencia - (p > 0 ? folga : 0));
      var arco = { comprimento: comprimento, deslocamento: acumulado ? -acumulado * circunferencia : 0 };
      acumulado += fracao;
      return arco;
    });
  }

  /** Altura (px) de cada barra, proporcional ao maior valor (com folga no topo). */
  function alturasBarras(valores, alturaMax) {
    var maior = Math.max.apply(null, valores.concat([1]));
    return valores.map(function (v) { return Math.max(v > 0 ? 3 : 0, Math.round((v / (maior * 1.15)) * alturaMax)); });
  }

  var api = { calcularArcos: calcularArcos, alturasBarras: alturasBarras, CIRCUNFERENCIA: CIRCUNFERENCIA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return; // Node (testes): só a geometria

  /* ---------------- utilitários de DOM ---------------- */

  var NS = 'http://www.w3.org/2000/svg';

  function $(id) { return document.getElementById(id); }

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function svg(tag, atributos, texto) {
    var n = document.createElementNS(NS, tag);
    Object.keys(atributos || {}).forEach(function (k) { n.setAttribute(k, atributos[k]); });
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function fmt(n, casas) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas === undefined ? 0 : casas });
  }

  function dataCurta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function dataLonga(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); return no; }

  function mensagemVazia(texto) { return el('p', 'db-sem-dados', texto); }

  function linkTexto(antes, texto, href, depois) {
    var p = document.createDocumentFragment();
    if (antes) p.appendChild(document.createTextNode(antes));
    var a = el('a', '', texto);
    a.href = href;
    p.appendChild(a);
    if (depois) p.appendChild(document.createTextNode(depois));
    return p;
  }

  function definir(id, conteudo) {
    var no = limpar($(id));
    if (typeof conteudo === 'string') no.textContent = conteudo;
    else if (conteudo) no.appendChild(conteudo);
  }

  /* ---------------- indicadores (KPIs) ---------------- */

  function renderKpis(r) {
    var ultima = r.fichas.ultima;

    definir('kpiFichas', fmt(r.fichas.total));
    definir('kpiFichasSub', ultima ? 'Última em ' + dataLonga(ultima.data) : '');

    definir('kpiKcal', ultima ? fmt(ultima.kcal) + ' kcal' : '--');
    definir(
      'kpiKcalSub',
      r.medias && r.fichas.evolucao.length > 1
        ? 'Média das últimas ' + r.fichas.evolucao.length + ': ' + fmt(r.medias.kcal) + ' kcal'
        : ''
    );

    definir('kpiProteina', ultima ? fmt(ultima.proteina, 1) + ' g' : '--');
    if (r.proteina && r.proteina.percentual !== null) {
      definir('kpiProteinaSub', r.proteina.percentual + '% da meta estimada (' + fmt(r.proteina.meta_g) + ' g)');
    } else {
      definir('kpiProteinaSub', linkTexto('', 'Informe seu peso', '/perfil', ' para ver a meta'));
    }

    if (r.imc) {
      definir('kpiImc', fmt(r.imc.valor, 1));
      definir('kpiImcSub', r.imc.classificacao);
    } else {
      definir('kpiImc', '--');
      definir('kpiImcSub', linkTexto('', 'Informe peso e altura', '/perfil', ' no perfil'));
    }
  }

  /* ---------------- donut de macros ---------------- */

  function renderMacros(r) {
    var alvo = limpar($('grafMacros'));
    var legenda = limpar($('legMacros'));
    var m = r.macros;
    var ultima = r.fichas.ultima;

    if (!m || !ultima) {
      alvo.appendChild(mensagemVazia('Sem dados de macros nesta ficha.'));
      return;
    }

    var itens = [
      { nome: 'Proteínas', pct: m.pct_proteina, g: ultima.proteina, cor: COR.proteina },
      { nome: 'Carboidratos', pct: m.pct_carboidratos, g: ultima.carboidratos, cor: COR.carboidratos },
      { nome: 'Gorduras', pct: m.pct_gordura, g: ultima.gordura, cor: COR.gordura },
    ];

    var resumo = itens.map(function (i) { return i.nome + ' ' + i.pct + '%'; }).join(', ');
    var s = svg('svg', { viewBox: '0 0 140 140', role: 'img', 'aria-label': 'Distribuição de calorias entre macros: ' + resumo });
    s.appendChild(svg('circle', { cx: 70, cy: 70, r: RAIO, fill: 'none', stroke: COR.trilho, 'stroke-width': 16 }));

    var arcos = calcularArcos(itens.map(function (i) { return i.pct; }), CIRCUNFERENCIA, 2);
    itens.forEach(function (i, idx) {
      if (i.pct <= 0) return;
      s.appendChild(svg('circle', {
        cx: 70, cy: 70, r: RAIO, fill: 'none', stroke: i.cor, 'stroke-width': 16,
        'stroke-dasharray': arcos[idx].comprimento + ' ' + (CIRCUNFERENCIA - arcos[idx].comprimento),
        'stroke-dashoffset': arcos[idx].deslocamento,
        transform: 'rotate(-90 70 70)',
      }));
    });
    var totalKcal = m.kcal_proteina + m.kcal_carboidratos + m.kcal_gordura;
    s.appendChild(svg('text', { x: 70, y: 68, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#0f172a' }, fmt(totalKcal)));
    s.appendChild(svg('text', { x: 70, y: 85, 'text-anchor': 'middle', 'font-size': 10, fill: COR.texto }, 'kcal dos macros'));
    alvo.appendChild(s);

    itens.forEach(function (i) {
      var li = el('li');
      var ponto = el('span', 'db-ponto');
      ponto.style.background = i.cor;
      li.appendChild(ponto);
      li.appendChild(el('span', 'db-legenda-nome', i.nome));
      li.appendChild(el('strong', '', i.pct + '%'));
      li.appendChild(el('small', '', fmt(i.g, 1) + ' g'));
      legenda.appendChild(li);
    });
  }

  /* ---------------- metas (proteína e peso) ---------------- */

  function linhaMeta(titulo) {
    var bloco = el('div', 'db-meta');
    bloco.appendChild(el('h3', '', titulo));
    return bloco;
  }

  function renderMetas(r) {
    var alvo = limpar($('blocoMetas'));

    var prot = linhaMeta('Proteína da última ficha');
    if (r.proteina && r.proteina.percentual !== null) {
      var trilho = el('div', 'db-progresso');
      var barra = el('div', 'db-progresso-barra');
      barra.style.width = Math.max(0, Math.min(100, r.proteina.percentual)) + '%';
      trilho.appendChild(barra);
      prot.appendChild(trilho);
      prot.appendChild(el('p', '', fmt(r.proteina.consumido_g, 1) + ' g de ' + fmt(r.proteina.meta_g) + ' g (' + r.proteina.percentual + '%)'));
      var nota = el('small', 'db-nota-meta', 'Estimativa de ' + String(r.proteina.por_kg).replace('.', ',') + ' g por kg de peso para o seu objetivo.');
      prot.appendChild(nota);
    } else {
      var dica = el('p', 'db-sem-dados');
      dica.appendChild(linkTexto('', 'Informe seu peso no perfil', '/perfil', ' para calcular sua meta de proteína.'));
      prot.appendChild(dica);
    }
    alvo.appendChild(prot);

    var peso = linhaMeta('Peso');
    if (r.peso && (r.peso.atual !== null || r.peso.alvo !== null)) {
      var linha = el('p', 'db-peso');
      linha.appendChild(el('span', '', 'Atual '));
      linha.appendChild(el('strong', '', r.peso.atual !== null ? fmt(r.peso.atual, 1) + ' kg' : '--'));
      linha.appendChild(el('span', 'db-separador', '→'));
      linha.appendChild(el('span', '', 'Alvo '));
      linha.appendChild(el('strong', '', r.peso.alvo !== null ? fmt(r.peso.alvo, 1) + ' kg' : '--'));
      peso.appendChild(linha);

      if (r.peso.diferenca !== null) {
        var d = r.peso.diferenca;
        var texto = d === 0 ? 'No peso alvo' : fmt(Math.abs(d), 1) + ' kg ' + (d > 0 ? 'acima do alvo' : 'abaixo do alvo');
        peso.appendChild(el('span', 'db-chip', texto));
      } else {
        var dicaPeso = el('p', 'db-sem-dados');
        dicaPeso.appendChild(linkTexto('', 'Defina seu peso alvo', '/perfil#goals-card', ' nas metas.'));
        peso.appendChild(dicaPeso);
      }
    } else {
      var semPeso = el('p', 'db-sem-dados');
      semPeso.appendChild(linkTexto('', 'Informe seu peso e sua meta', '/perfil', ' no perfil.'));
      peso.appendChild(semPeso);
    }
    if (r.foco) peso.appendChild(el('span', 'db-chip db-chip--suave', 'Foco: ' + r.foco));
    alvo.appendChild(peso);
  }

  /* ---------------- evolução das calorias (barras em SVG) ---------------- */

  function renderEvolucao(r) {
    var alvo = limpar($('grafEvolucao'));
    var pontos = r.fichas.evolucao;
    definir('evolucaoSub', pontos.length === 1 ? '1 ficha' : pontos.length + ' fichas mais recentes');

    if (!pontos.length) {
      alvo.appendChild(mensagemVazia('Sem fichas para exibir.'));
      return;
    }

    var L = 640, A = 240, padE = 12, padD = 12, padT = 30, padB = 34;
    var areaA = A - padT - padB;
    var valores = pontos.map(function (p) { return p.kcal; });
    var alturas = alturasBarras(valores, areaA);
    var slot = (L - padE - padD) / pontos.length;
    var larguraBarra = Math.min(60, slot * 0.6);
    var base = A - padB;

    var resumo = pontos.map(function (p) { return dataCurta(p.data) + ': ' + fmt(p.kcal) + ' kcal'; }).join('; ');
    var s = svg('svg', { viewBox: '0 0 ' + L + ' ' + A, role: 'img', 'aria-label': 'Calorias por ficha. ' + resumo, preserveAspectRatio: 'xMidYMid meet' });

    s.appendChild(svg('line', { x1: padE, y1: base, x2: L - padD, y2: base, stroke: COR.trilho, 'stroke-width': 1 }));

    // linha da média
    if (r.medias && pontos.length > 1) {
      var yMedia = base - Math.round((r.medias.kcal / (Math.max.apply(null, valores.concat([1])) * 1.15)) * areaA);
      s.appendChild(svg('line', { x1: padE, y1: yMedia, x2: L - padD, y2: yMedia, stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }));
      s.appendChild(svg('text', { x: L - padD, y: yMedia - 5, 'text-anchor': 'end', 'font-size': 11, fill: COR.texto }, 'média ' + fmt(r.medias.kcal) + ' kcal'));
    }

    pontos.forEach(function (p, i) {
      var cx = padE + slot * i + slot / 2;
      var altura = alturas[i];
      var atual = i === pontos.length - 1;
      s.appendChild(svg('rect', {
        x: cx - larguraBarra / 2, y: base - altura, width: larguraBarra, height: altura, rx: 6,
        fill: atual ? COR.barraAtual : COR.barra,
      }));
      s.appendChild(svg('text', { x: cx, y: base - altura - 7, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#0f172a' }, fmt(p.kcal)));
      s.appendChild(svg('text', { x: cx, y: A - 12, 'text-anchor': 'middle', 'font-size': 11, fill: COR.texto }, dataCurta(p.data)));
    });

    alvo.appendChild(s);
  }

  /* ---------------- barras horizontais em HTML ---------------- */

  function renderBarras(id, linhas, vazio) {
    var alvo = limpar($(id));
    if (!linhas.length) { alvo.appendChild(mensagemVazia(vazio)); return; }

    var maior = Math.max.apply(null, linhas.map(function (l) { return l.valor; }).concat([1]));
    linhas.forEach(function (l) {
      var linha = el('div', 'db-barra');
      var topo = el('div', 'db-barra-topo');
      topo.appendChild(el('span', 'db-barra-nome', l.nome));
      topo.appendChild(el('strong', '', fmt(l.valor) + ' kcal'));
      var trilho = el('div', 'db-progresso');
      var preenchimento = el('div', 'db-progresso-barra');
      preenchimento.style.width = Math.max(4, Math.round((l.valor / maior) * 100)) + '%';
      trilho.appendChild(preenchimento);
      linha.appendChild(topo);
      if (l.detalhe) linha.appendChild(el('small', '', l.detalhe));
      linha.appendChild(trilho);
      alvo.appendChild(linha);
    });
  }

  function renderItens(r) {
    renderBarras(
      'grafItens',
      r.itens_ultima_ficha.map(function (i) {
        return { nome: i.nome, valor: i.kcal, detalhe: fmt(i.quantidade_g) + ' g' };
      }),
      'Sem calorias por alimento nesta ficha.'
    );
  }

  function renderRefeicoes(r) {
    var cartao = $('cartaoRefeicoes');
    cartao.hidden = !r.refeicoes.length;
    if (!r.refeicoes.length) return;
    renderBarras('grafRefeicoes', r.refeicoes.map(function (x) { return { nome: x.nome, valor: x.kcal }; }), '');
  }

  function renderFrequentes(r) {
    var lista = limpar($('listaFrequentes'));
    if (!r.alimentos_frequentes.length) {
      lista.appendChild(el('li', 'db-sem-dados', 'Sem alimentos registrados nas fichas.'));
      return;
    }
    r.alimentos_frequentes.forEach(function (a) {
      var li = el('li');
      li.appendChild(el('span', 'db-ranking-nome', a.nome));
      li.appendChild(el('span', 'db-chip db-chip--suave', a.vezes + (a.vezes === 1 ? ' ficha' : ' fichas')));
      lista.appendChild(li);
    });
  }

  function renderSalus(r) {
    definir('salusMensagens', fmt(r.chat.mensagens));
    definir('salusFavoritas', fmt(r.chat.favoritas));
  }

  /* ---------------- fluxo ---------------- */

  function alternar(id, visivel) { $(id).hidden = !visivel; }

  function render(r) {
    alternar('dbCarregando', false);
    alternar('dbErro', false);
    $('dbPrincipal').setAttribute('aria-busy', 'false');

    if (r.usuario && r.usuario.nome) {
      var mini = document.querySelector('.mini-info h4');
      if (mini) mini.textContent = r.usuario.nome;
      definir('dbSubtitulo', r.usuario.nome.split(' ')[0] + ', estes são os seus números a partir das suas fichas.');
    }

    if (!r.fichas.total) {
      alternar('dbVazio', true);
      alternar('dbConteudo', false);
      return;
    }

    alternar('dbVazio', false);
    alternar('dbConteudo', true);
    renderKpis(r);
    renderMacros(r);
    renderMetas(r);
    renderEvolucao(r);
    renderItens(r);
    renderRefeicoes(r);
    renderFrequentes(r);
    renderSalus(r);
  }

  function mostrarErro(texto) {
    alternar('dbCarregando', false);
    alternar('dbConteudo', false);
    alternar('dbVazio', false);
    $('dbPrincipal').setAttribute('aria-busy', 'false');
    definir('dbErroTexto', texto || 'Não foi possível carregar o dashboard agora.');
    alternar('dbErro', true);
  }

  function carregar() {
    var token = null;
    try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
    if (!token) {
      window.location.href = window.NLVoltar ? window.NLVoltar.urlLogin() : '/login';
      return;
    }

    alternar('dbErro', false);
    alternar('dbCarregando', true);
    $('dbPrincipal').setAttribute('aria-busy', 'true');

    fetch('/api/dashboard/resumo', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(render)
      .catch(function () { mostrarErro(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('dbTentar').addEventListener('click', carregar);
    carregar();
  });
})();
