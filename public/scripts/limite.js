/*
 * Avisos da cota diária de visitantes (chat e Tabela TACO).
 *
 * O servidor informa o saldo em cabeçalhos (X-Limite-*) nas respostas bem-sucedidas, no corpo do
 * 429 (limite_diario) e em GET /api/uso/:recurso. Este módulo só desenha os avisos:
 *   NLLimite.status(recurso)   -> Promise<info|null>   (saldo sem consumir; logado = ilimitado)
 *   NLLimite.doCabecalho(res)  -> info|null            (lê X-Limite-* de uma resposta)
 *   NLLimite.doCorpo(json)     -> info|null            (lê o corpo de um 429/status)
 *   NLLimite.faixa(info)       -> HTMLElement          ("Você ainda tem 3 de 5 consultas grátis hoje")
 *   NLLimite.cartao(info, rec) -> HTMLElement          (acabaram + quando renova + benefícios do login)
 * info = { total, restantes, renovaEm: Date }
 */
(function () {
  'use strict';

  var ROTULOS = { chat: 'do chat', taco: 'da Tabela TACO' };

  var BENEFICIOS = [
    'Chat e Tabela TACO sem limite de consultas',
    'Respostas da IA personalizadas com a sua ficha alimentar',
    'Criar, editar e guardar suas fichas alimentares',
    'Análise de rótulos por foto, com IA',
    'Perfil, metas e sugestões de alimentos do dia no painel',
  ];

  var ICONE_RELOGIO =
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>';

  function paraInfo(total, restantes, renovaEm) {
    total = Number(total);
    restantes = Number(restantes);
    var data = new Date(renovaEm);
    if (!isFinite(total) || !isFinite(restantes) || isNaN(data.getTime())) return null;
    return { total: total, restantes: restantes, renovaEm: data };
  }

  function doCabecalho(res) {
    if (!res || !res.headers) return null;
    var total = res.headers.get('X-Limite-Total');
    if (total === null) return null; // logado: o servidor não envia cabeçalhos
    return paraInfo(total, res.headers.get('X-Limite-Restantes'), res.headers.get('X-Limite-Renova-Em'));
  }

  function doCorpo(json) {
    if (!json || json.ilimitado || json.total === undefined) return null;
    return paraInfo(json.total, json.restantes, json.renova_em);
  }

  function status(recurso) {
    var headers = {};
    var token = window.NLSession && window.NLSession.token();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch('/api/uso/' + encodeURIComponent(recurso), { headers: headers })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(doCorpo)
      .catch(function () { return null; });
  }

  /** Login que devolve o usuário à página atual (chat ou TACO) depois de entrar. */
  function urlLogin() {
    return window.NLVoltar ? window.NLVoltar.urlLogin() : '/login';
  }

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function tempoRestante(renovaEm) {
    var min = Math.max(0, Math.ceil((renovaEm.getTime() - Date.now()) / 60000));
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h === 0) return m + ' min';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'min';
  }

  function horaDeRenovacao(renovaEm) {
    return renovaEm.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  function faixa(info) {
    var poucas = info.restantes <= 1;
    var caixa = el('div', 'nl-limite-faixa' + (poucas ? ' nl-limite-faixa--alerta' : ''));
    caixa.setAttribute('role', 'status');

    caixa.appendChild(document.createTextNode('Consultas grátis hoje: '));
    caixa.appendChild(el('strong', '', info.restantes + ' de ' + info.total));
    caixa.appendChild(document.createTextNode(' · '));

    var link = el('a', '', 'Entre');
    link.href = urlLogin();
    caixa.appendChild(link);
    caixa.appendChild(document.createTextNode(' para usar sem limites'));
    return caixa;
  }

  function cartao(info, recurso) {
    var rotulo = ROTULOS[recurso] || '';
    var caixa = el('section', 'nl-limite-cartao');
    caixa.setAttribute('role', 'status');

    var icone = el('div', 'nl-limite-icone');
    icone.innerHTML = ICONE_RELOGIO; // SVG estático nosso
    caixa.appendChild(icone);

    caixa.appendChild(el('h3', '', 'Suas consultas gratuitas de hoje acabaram'));

    var texto = el('p', 'nl-limite-texto');
    texto.appendChild(
      document.createTextNode('Você usou as ' + info.total + ' consultas grátis ' + rotulo + '. Elas renovam às ' +
        horaDeRenovacao(info.renovaEm) + ' (horário de Brasília), daqui a ')
    );
    var contagem = el('strong', '', tempoRestante(info.renovaEm));
    texto.appendChild(contagem);
    texto.appendChild(document.createTextNode('.'));
    caixa.appendChild(texto);

    var timer = setInterval(function () {
      if (!caixa.isConnected) { clearInterval(timer); return; }
      contagem.textContent = tempoRestante(info.renovaEm);
    }, 30000);

    var beneficios = el('div', 'nl-limite-beneficios');
    beneficios.appendChild(el('h4', '', 'Faça login e ganhe:'));
    var lista = el('ul');
    BENEFICIOS.forEach(function (b) { lista.appendChild(el('li', '', b)); });
    beneficios.appendChild(lista);
    caixa.appendChild(beneficios);

    var acoes = el('div', 'nl-limite-acoes');
    var criar = el('a', 'nl-limite-btn nl-limite-btn--primario', 'Criar conta grátis');
    criar.href = urlLogin();
    var entrar = el('a', 'nl-limite-btn', 'Já tenho conta · Entrar');
    entrar.href = urlLogin();
    acoes.appendChild(criar);
    acoes.appendChild(entrar);
    caixa.appendChild(acoes);

    return caixa;
  }

  window.NLLimite = {
    status: status,
    doCabecalho: doCabecalho,
    doCorpo: doCorpo,
    faixa: faixa,
    cartao: cartao,
  };
})();
