/*
 * Tema claro / escuro / automático.
 *
 * Carregar no <head>, ANTES dos estilos: aplica o tema na hora (sem "piscar" claro antes de escurecer).
 *  - escolha guardada em localStorage ('nl-tema': 'claro' | 'escuro'); sem escolha = automático,
 *    que segue o tema do aparelho e muda junto com ele;
 *  - <html data-theme="dark|light"> é o que o tema.css lê; data-tema-modo guarda a escolha (auto|claro|escuro);
 *  - botões de alternar entram sozinhos: no rodapé do menu lateral, na barra do topo (visitante), no menu
 *    da landing/notícias ou, em páginas sem nada disso (login, privacidade…), como botão flutuante;
 *  - no perfil, o cartão "Aparência" escolhe entre Automático, Claro e Escuro.
 *
 * Expõe window.NLTema { modo(), efetivo(), definir(m), alternar(), rotulo() }.
 */
(function () {
  'use strict';

  if (window.NLTema) return;

  var CHAVE = 'nl-tema';
  var raiz = document.documentElement;
  var consulta = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var COR_BARRA = { dark: '#0b1210', light: '#047857' };

  function lerModo() {
    try {
      var v = localStorage.getItem(CHAVE);
      return v === 'claro' || v === 'escuro' ? v : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function calcular(modo) {
    if (modo === 'escuro') return 'dark';
    if (modo === 'claro') return 'light';
    return consulta && consulta.matches ? 'dark' : 'light';
  }

  function atualizarMeta(tema) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR_BARRA[tema]);
  }

  function rotuloAtual() {
    return raiz.getAttribute('data-theme') === 'dark' ? 'Modo claro' : 'Modo escuro';
  }

  function sincronizarInterface() {
    var tema = raiz.getAttribute('data-theme');
    var modo = raiz.getAttribute('data-tema-modo');
    atualizarMeta(tema);

    Array.prototype.forEach.call(document.querySelectorAll('[data-nl-tema-botao]'), function (b) {
      b.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');
      b.setAttribute('title', rotuloAtual());
      b.setAttribute('aria-label', rotuloAtual());
      // só escreve se mudou: trocar o texto dispara o MutationObserver, que chamaria isto de novo (laço infinito)
      var r = b.querySelector('.nl-tema-rotulo');
      if (r && r.textContent !== rotuloAtual()) r.textContent = rotuloAtual();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-tema-opcao]'), function (b) {
      var ativo = b.getAttribute('data-tema-opcao') === modo;
      b.setAttribute('aria-checked', ativo ? 'true' : 'false');
      b.classList.toggle('ativo', ativo);
    });
  }

  function aplicar(modo) {
    raiz.setAttribute('data-theme', calcular(modo));
    raiz.setAttribute('data-tema-modo', modo);
    sincronizarInterface();
    try {
      window.dispatchEvent(new CustomEvent('nl-tema', { detail: { modo: modo, tema: raiz.getAttribute('data-theme') } }));
    } catch (_) { /* navegador sem CustomEvent */ }
  }

  function definir(modo) {
    var valido = modo === 'claro' || modo === 'escuro' ? modo : 'auto';
    try {
      if (valido === 'auto') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, valido);
    } catch (_) { /* sem storage: vale só nesta página */ }
    aplicar(valido);
  }

  function alternar() {
    definir(raiz.getAttribute('data-theme') === 'dark' ? 'claro' : 'escuro');
  }

  window.NLTema = {
    modo: function () { return raiz.getAttribute('data-tema-modo') || 'auto'; },
    efetivo: function () { return raiz.getAttribute('data-theme') || 'light'; },
    definir: definir,
    alternar: alternar,
    rotulo: rotuloAtual,
  };

  // Aplica já, no <head>.
  aplicar(lerModo());

  // Automático acompanha o aparelho; mudança feita em outra aba também vale aqui.
  if (consulta) {
    var aoMudar = function () { if (lerModo() === 'auto') aplicar('auto'); };
    if (consulta.addEventListener) consulta.addEventListener('change', aoMudar);
    else if (consulta.addListener) consulta.addListener(aoMudar);
  }
  window.addEventListener('storage', function (e) {
    if (e.key === CHAVE || e.key === null) aplicar(lerModo());
  });

  /* ---------- Botões ---------- */

  var NS = 'http://www.w3.org/2000/svg';

  function icone(classe, formas) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', classe);
    formas.forEach(function (f) {
      var el = document.createElementNS(NS, f.tag);
      Object.keys(f.attrs).forEach(function (k) { el.setAttribute(k, f.attrs[k]); });
      svg.appendChild(el);
    });
    return svg;
  }

  function criarBotao(variante) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nl-tema-btn' + (variante ? ' nl-tema-btn--' + variante : '');
    b.setAttribute('data-nl-tema-botao', '1');
    b.appendChild(icone('lua', [{ tag: 'path', attrs: { d: 'M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z' } }]));
    b.appendChild(icone('sol', [
      { tag: 'circle', attrs: { cx: '12', cy: '12', r: '4.2' } },
      { tag: 'path', attrs: { d: 'M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6' } },
    ]));
    var r = document.createElement('span');
    r.className = 'nl-tema-rotulo';
    b.appendChild(r);
    b.addEventListener('click', alternar);
    return b;
  }

  function jaTem(el) { return el.querySelector('[data-nl-tema-botao]'); }

  // Procura o melhor lugar para o botão; devolve true se colocou.
  function instalarEmSlots() {
    var colocou = false;

    // 1) rodapé do menu lateral (logado, PC): antes do botão de sair
    Array.prototype.forEach.call(document.querySelectorAll('.sidebar-footer .user-mini-profile, .nl-footer .nl-user'), function (caixa) {
      colocou = true;
      if (jaTem(caixa)) return;
      var sair = caixa.querySelector('.btn-mini-logout, .nl-logout');
      caixa.insertBefore(criarBotao('rodape'), sair || null);
    });

    // 2) barra pública injetada pelo sidebar.js (visitante)
    var topo = document.querySelector('.nl-topbar-nav ul');
    if (topo) {
      colocou = true;
      if (!jaTem(topo)) {
        var li = document.createElement('li');
        li.className = 'nl-tema-li';
        li.appendChild(criarBotao('topo'));
        var entrar = topo.querySelector('.nl-btn-outline');
        var alvo = entrar && entrar.closest('li');
        topo.insertBefore(li, alvo || null);
      }
    }

    // 3) cabeçalho próprio da landing e das notícias
    var nav = document.querySelector('header[data-nav-publica] nav ul');
    if (nav && !topo && !raiz.classList.contains('nl-logado')) {
      colocou = true;
      if (!jaTem(nav)) {
        var item = document.createElement('li');
        item.className = 'nl-tema-li';
        item.appendChild(criarBotao('cabecalho'));
        var login = nav.querySelector('.login-btn');
        var antes = login && login.closest('li');
        nav.insertBefore(item, antes || null);
      }
    }
    return colocou;
  }

  function temMenuLateral() {
    return !!document.querySelector('.sidebar, .nl-sidebar');
  }

  function instalarFlutuante() {
    // só quando a página não tem onde encaixar o botão (nem menu lateral, nem barra/cabeçalho com botão)
    if (document.querySelector('[data-nl-tema-botao]') || temMenuLateral()) return;
    var b = criarBotao('flutuante');
    b.classList.add('nl-tema-flutuante');
    document.body.appendChild(b);
    sincronizarInterface();
  }

  /* ---------- Seletor do perfil (Automático / Claro / Escuro) ---------- */

  function ligarSeletor() {
    var opcoes = document.querySelectorAll('[data-tema-opcao]');
    Array.prototype.forEach.call(opcoes, function (b) {
      if (b.getAttribute('data-ligado')) return;
      b.setAttribute('data-ligado', '1');
      b.addEventListener('click', function () { definir(b.getAttribute('data-tema-opcao')); });
    });
  }

  function instalar() {
    instalarEmSlots();
    ligarSeletor();
    sincronizarInterface();
  }

  function iniciar() {
    instalar();
    // sidebar.js e nav-mobile.js montam a navegação durante/depois do carregamento
    var agendado = false;
    var obs = new MutationObserver(function () {
      if (agendado) return;
      agendado = true;
      setTimeout(function () { agendado = false; instalar(); }, 50);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 5000);

    if (document.readyState === 'complete') instalarFlutuante();
    else window.addEventListener('load', function () { instalar(); instalarFlutuante(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
