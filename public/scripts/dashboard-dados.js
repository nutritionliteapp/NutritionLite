/*
 * Dashboard: dados reais do usuário (objetivo e meta de proteína) e botões do card de perfil.
 * Antes o objetivo ("Perder peso com saúde") e o progresso ("85%") eram texto fixo no HTML.
 *
 * A lógica de cálculo é pura e também é exportada para os testes (Node).
 */
(function () {
  'use strict';

  var OBJETIVOS = {
    perder_peso: { texto: 'Perder peso com saúde', icone: 'bx-trending-down', proteinaPorKg: 1.4 },
    ganhar_massa: { texto: 'Ganhar massa muscular', icone: 'bx-trending-up', proteinaPorKg: 1.8 },
    manter_saude: { texto: 'Manter a saúde', icone: 'bx-heart', proteinaPorKg: 1.0 },
  };

  /** Aceita o código (perder_peso) ou o texto livre das metas ("Ganho de massa", "Perder gordura"). */
  function normalizarObjetivo(valor) {
    if (!valor) return null;
    var t = String(valor).toLowerCase();
    if (OBJETIVOS[t]) return t;
    if (/perder|gordura|emagrec/.test(t)) return 'perder_peso';
    if (/ganh|massa|hipertrof/.test(t)) return 'ganhar_massa';
    if (/manter|saud/.test(t)) return 'manter_saude';
    return null;
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    var n = parseFloat(String(valor).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /**
   * Meta estimada = peso × g/kg do objetivo; consumo = proteína total da ficha mais recente.
   * Estimativa geral (orientação educativa), não prescrição.
   * estado: 'sem_peso' | 'sem_ficha' | 'ok'
   */
  function calcularProteina(perfil) {
    var objetivo = normalizarObjetivo(perfil && perfil.objetivo) || 'manter_saude';
    var peso = numero(perfil && perfil.peso);
    var consumido = numero(perfil && perfil.total_proteina);

    if (peso === null || peso <= 0) return { estado: 'sem_peso' };

    var porKg = OBJETIVOS[objetivo].proteinaPorKg;
    var metaG = peso * porKg;

    if (consumido === null) return { estado: 'sem_ficha', metaG: metaG, porKg: porKg };

    return {
      estado: 'ok',
      metaG: metaG,
      consumidoG: consumido,
      porKg: porKg,
      percentual: Math.round((consumido / metaG) * 100),
    };
  }

  var api = {
    OBJETIVOS: OBJETIVOS,
    normalizarObjetivo: normalizarObjetivo,
    calcularProteina: calcularProteina,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return; // Node (testes): só a lógica

  /* ---------------- DOM ---------------- */

  function formatar(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function irPara(url) {
    return function () { window.location.href = url; };
  }

  function aplicarObjetivo(perfil) {
    var box = document.querySelector('.goal-box');
    if (!box) return;

    var chave = normalizarObjetivo(perfil && perfil.objetivo);
    var icone = document.createElement('i');
    box.textContent = '';

    if (chave) {
      icone.className = 'bx ' + OBJETIVOS[chave].icone;
      box.appendChild(icone);
      box.appendChild(document.createTextNode(' ' + OBJETIVOS[chave].texto));
      return;
    }

    icone.className = 'bx bx-target-lock';
    box.appendChild(icone);
    if (perfil) {
      // Perfil carregou, mas ainda não há objetivo (nem ficha nem meta): leva a criar a ficha.
      box.appendChild(document.createTextNode(' Defina seu objetivo'));
      box.style.cursor = 'pointer';
      box.title = 'Crie sua ficha alimentar para definir seu objetivo';
      box.addEventListener('click', irPara('/ficha'));
    } else {
      box.appendChild(document.createTextNode(' Indisponível no momento'));
    }
  }

  function textoComLink(elemento, antes, textoLink, href, depois) {
    elemento.textContent = '';
    if (antes) elemento.appendChild(document.createTextNode(antes));
    var link = document.createElement('a');
    link.href = href;
    link.textContent = textoLink;
    link.style.color = 'inherit';
    link.style.fontWeight = '700';
    elemento.appendChild(link);
    if (depois) elemento.appendChild(document.createTextNode(depois));
  }

  function aplicarProteina(perfil) {
    var secao = document.querySelector('.progress-section');
    if (!secao) return;

    var percentual = secao.querySelector('h4 span');
    var barra = secao.querySelector('.progress-bar-fill');
    var titulo = secao.querySelector('h4');

    var dica = secao.querySelector('.nl-dica');
    if (!dica) {
      dica = document.createElement('p');
      dica.className = 'nl-dica';
      dica.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-top:8px;line-height:1.4;';
      secao.appendChild(dica);
    }

    if (!perfil) {
      percentual.textContent = '--';
      barra.style.width = '0%';
      dica.textContent = 'Não foi possível carregar seus dados agora.';
      return;
    }

    var r = calcularProteina(perfil);

    if (r.estado === 'sem_peso') {
      percentual.textContent = '--';
      barra.style.width = '0%';
      textoComLink(dica, '', 'Informe seu peso no perfil', '/perfil', ' para calcular sua meta de proteína.');
      return;
    }

    if (r.estado === 'sem_ficha') {
      percentual.textContent = '0%';
      barra.style.width = '0%';
      textoComLink(dica, 'Meta estimada: ' + formatar(r.metaG) + ' g. ', 'Crie sua ficha', '/ficha', ' para acompanhar.');
      return;
    }

    percentual.textContent = r.percentual + '%';
    barra.style.width = Math.max(0, Math.min(100, r.percentual)) + '%';
    dica.textContent =
      formatar(r.consumidoG) + ' g na sua ficha · meta estimada de ' + formatar(r.metaG) + ' g';
    titulo.title =
      'Estimativa geral de ' + String(r.porKg).replace('.', ',') +
      ' g de proteína por kg de peso para o seu objetivo. Não substitui orientação de nutricionista.';
  }

  function ligarBotoes() {
    var botoes = document.querySelectorAll('.btn-action-card');
    if (botoes[0]) {
      botoes[0].title = 'Editar seus dados pessoais';
      botoes[0].addEventListener('click', irPara('/perfil'));
    }
    if (botoes[1]) {
      botoes[1].title = 'Ajustar objetivo e metas';
      botoes[1].addEventListener('click', irPara('/perfil#goals-card'));
    }
  }

  /** Dados do perfil (objetivo, peso e totais da última ficha), ou null se a API falhar. */
  function buscarPerfil() {
    var token = null;
    try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
    if (!token) return Promise.resolve(null); // o dashboard já redireciona para o login

    return fetch('/api/usuarios/perfil', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  // Promise compartilhada: o script do dashboard também usa o objetivo para as sugestões do dia.
  var perfilPromise = buscarPerfil();
  window.NLDashboard = Object.assign({ perfil: perfilPromise }, api);

  function aoCarregar(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  aoCarregar(function () {
    ligarBotoes();
    perfilPromise.then(function (perfil) {
      aplicarObjetivo(perfil);
      aplicarProteina(perfil);
    });
  });
})();
