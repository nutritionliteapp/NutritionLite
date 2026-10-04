/** Tema claro/escuro: lógica do theme.js, paleta (contraste), cobertura das páginas e proteção contra cores fixas. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/* ---------- theme.js num DOM falso (só a lógica; os botões dependem de DOM real) ---------- */

function carregarTema({ sistemaEscuro = false, guardado = null, storageQuebrado = false } = {}) {
  const atributos = {};
  const meta = { conteudo: '#047857', setAttribute(k, v) { if (k === 'content') this.conteudo = v; } };
  const raiz = {
    setAttribute: (k, v) => { atributos[k] = v; },
    getAttribute: (k) => (k in atributos ? atributos[k] : null),
    classList: { contains: () => false },
  };
  const loja = guardado ? { 'nl-tema': guardado } : {};
  const localStorage = {
    getItem: (k) => { if (storageQuebrado) throw new Error('bloqueado'); return k in loja ? loja[k] : null; },
    setItem: (k, v) => { if (storageQuebrado) throw new Error('bloqueado'); loja[k] = String(v); },
    removeItem: (k) => { if (storageQuebrado) throw new Error('bloqueado'); delete loja[k]; },
  };
  const ouvintesMedia = [];
  const midia = { matches: sistemaEscuro, addEventListener: (_e, f) => ouvintesMedia.push(f) };
  const eventos = [];
  const janela = {
    matchMedia: () => midia,
    addEventListener: () => {},
    dispatchEvent: (e) => { eventos.push(e); return true; },
  };
  const documento = {
    documentElement: raiz,
    readyState: 'loading', // não monta botões: o DOM de verdade é testado no navegador
    addEventListener: () => {},
    querySelector: (s) => (s === 'meta[name="theme-color"]' ? meta : null),
    querySelectorAll: () => [],
  };
  janela.document = documento;
  janela.localStorage = localStorage;
  vm.runInNewContext(ler('public', 'scripts', 'theme.js'), {
    window: janela,
    document: documento,
    localStorage,
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout,
  });
  return { janela, raiz, meta, loja, eventos, mudarSistema: (escuro) => { midia.matches = escuro; ouvintesMedia.forEach((f) => f()); } };
}

describe('theme.js — escolha e aplicação do tema', () => {
  test('sem escolha, segue o aparelho (escuro ou claro)', () => {
    const escuro = carregarTema({ sistemaEscuro: true });
    expect(escuro.raiz.getAttribute('data-theme')).toBe('dark');
    expect(escuro.raiz.getAttribute('data-tema-modo')).toBe('auto');
    expect(carregarTema({ sistemaEscuro: false }).raiz.getAttribute('data-theme')).toBe('light');
  });

  test('a escolha do usuário vence o aparelho, nos dois sentidos', () => {
    expect(carregarTema({ sistemaEscuro: false, guardado: 'escuro' }).raiz.getAttribute('data-theme')).toBe('dark');
    expect(carregarTema({ sistemaEscuro: true, guardado: 'claro' }).raiz.getAttribute('data-theme')).toBe('light');
  });

  test('valor guardado inválido volta para automático', () => {
    const t = carregarTema({ sistemaEscuro: true, guardado: '<script>' });
    expect(t.raiz.getAttribute('data-tema-modo')).toBe('auto');
    expect(t.raiz.getAttribute('data-theme')).toBe('dark');
  });

  test('definir/alternar gravam a escolha; "auto" apaga e volta a seguir o aparelho', () => {
    const t = carregarTema({ sistemaEscuro: false });
    const { NLTema } = t.janela;
    NLTema.definir('escuro');
    expect(t.loja['nl-tema']).toBe('escuro');
    expect(NLTema.efetivo()).toBe('dark');
    NLTema.alternar();
    expect(t.loja['nl-tema']).toBe('claro');
    expect(NLTema.efetivo()).toBe('light');
    NLTema.definir('auto');
    expect('nl-tema' in t.loja).toBe(false);
    expect(NLTema.modo()).toBe('auto');
    NLTema.definir('qualquer coisa');
    expect(NLTema.modo()).toBe('auto');
  });

  test('em automático acompanha a mudança do aparelho; com escolha explícita, ignora', () => {
    const auto = carregarTema({ sistemaEscuro: false });
    auto.mudarSistema(true);
    expect(auto.raiz.getAttribute('data-theme')).toBe('dark');

    const fixo = carregarTema({ sistemaEscuro: false, guardado: 'claro' });
    fixo.mudarSistema(true);
    expect(fixo.raiz.getAttribute('data-theme')).toBe('light');
  });

  test('atualiza a cor da barra do navegador e avisa a página (evento nl-tema)', () => {
    const t = carregarTema({ sistemaEscuro: true });
    expect(t.meta.conteudo).toBe('#0b1210');
    t.janela.NLTema.definir('claro');
    expect(t.meta.conteudo).toBe('#047857');
    const ultimo = t.eventos[t.eventos.length - 1];
    expect(ultimo.type).toBe('nl-tema');
    expect(ultimo.detail).toEqual({ modo: 'claro', tema: 'light' });
  });

  test('localStorage bloqueado (modo privado) não quebra nada', () => {
    const t = carregarTema({ sistemaEscuro: true, storageQuebrado: true });
    expect(t.raiz.getAttribute('data-theme')).toBe('dark');
    expect(() => t.janela.NLTema.definir('claro')).not.toThrow();
    expect(t.janela.NLTema.efetivo()).toBe('light'); // vale nesta página, só não persiste
  });
});

/* ---------- paleta escura: contraste e completude ---------- */

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};

function blocoEscuro() {
  const css = ler('public', 'css', 'tema.css');
  const inicio = css.indexOf('html[data-theme="dark"] {');
  const fim = css.indexOf('\n}', inicio);
  const mapa = {};
  for (const [, nome, valor] of css.slice(inicio, fim).matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) mapa[nome] = valor.toLowerCase();
  return mapa;
}
function claro() {
  const mapa = {};
  for (const [, nome, valor] of ler('public', 'css', 'tokens.css').matchAll(/(--nl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) mapa[nome] = valor.toLowerCase();
  return mapa;
}

describe('Tema escuro — contraste (WCAG AA, texto normal ≥ 4,5:1)', () => {
  const d = blocoEscuro();

  test.each([
    ['texto principal sobre superfície', '--nl-ink-900', '--nl-surface'],
    ['texto principal sobre o fundo', '--nl-ink-900', '--nl-bg'],
    ['texto 800 sobre superfície', '--nl-ink-800', '--nl-surface'],
    ['texto 700 sobre superfície', '--nl-ink-700', '--nl-surface'],
    ['texto secundário (600) sobre superfície', '--nl-ink-600', '--nl-surface'],
    ['texto de apoio (500) sobre superfície', '--nl-ink-500', '--nl-surface'],
    ['texto de apoio (500) sobre o fundo', '--nl-ink-500', '--nl-bg'],
    ['texto principal sobre campos (surface-2)', '--nl-ink-900', '--nl-surface-2'],
    ['esmeralda-texto 600 sobre superfície', '--nl-txt-600', '--nl-surface'],
    ['esmeralda-texto 700 sobre superfície', '--nl-txt-700', '--nl-surface'],
    ['esmeralda-texto 800 sobre tinta 50', '--nl-txt-800', '--nl-emerald-50'],
    ['esmeralda-texto 900 sobre superfície', '--nl-txt-900', '--nl-surface'],
    ['esmeralda-texto 700 sobre tinta 100 (selos, ícones)', '--nl-txt-700', '--nl-emerald-100'],
    ['erro sobre fundo de erro', '--nl-danger', '--nl-danger-bg'],
    ['erro sobre fundo de erro (soft)', '--nl-danger', '--nl-danger-soft'],
    ['aviso sobre fundo de aviso', '--nl-warning', '--nl-warning-bg'],
    ['aviso sobre aviso (soft)', '--nl-warning', '--nl-warning-soft'],
    ['barra atual do gráfico sobre superfície', '--nl-bar-atual', '--nl-surface'],
  ])('%s', (_d, frente, fundo) => {
    expect(contraste(d[frente], d[fundo])).toBeGreaterThanOrEqual(4.5);
  });

  test('botões escuros (texto branco) continuam legíveis e visíveis sobre a superfície', () => {
    expect(contraste('#ffffff', d['--nl-fill-ink'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', d['--nl-fill-ink-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', d['--nl-fill-muted'])).toBeGreaterThanOrEqual(3); // desabilitado
  });

  test('a cor de ação (botão esmeralda, texto branco) e o texto sobre mint não mudam no escuro', () => {
    const c = claro();
    expect(d['--nl-action']).toBeUndefined();
    expect(contraste('#ffffff', c['--nl-emerald-700'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c['--nl-on-mint'], c['--nl-mint-400'])).toBeGreaterThanOrEqual(4.5);
    expect(d['--nl-mint-400']).toBeUndefined();
    expect(d['--nl-emerald-700']).toBeUndefined(); // preenchimentos continuam escuros; só as tintas e os "txt-*" mudam
    expect(d['--nl-emerald-600']).toBeUndefined();
  });

  test('toda variável que o modo claro usa como tema tem versão escura (nada fica claro por esquecimento)', () => {
    const c = claro();
    const temaveis = ['--nl-bg', '--nl-surface', '--nl-surface-2', '--nl-line', '--nl-ink-900', '--nl-ink-800', '--nl-ink-700', '--nl-ink-600', '--nl-ink-500', '--nl-ink-400', '--nl-emerald-50', '--nl-emerald-100', '--nl-emerald-200', '--nl-danger', '--nl-danger-bg', '--nl-danger-soft', '--nl-danger-line', '--nl-warning', '--nl-warning-bg', '--nl-warning-soft', '--nl-warning-line', '--nl-fill-ink', '--nl-fill-ink-hover', '--nl-fill-muted', '--nl-bar-atual'];
    for (const nome of temaveis) {
      expect({ nome, claro: Boolean(c[nome]), escuro: Boolean(d[nome]) }).toEqual({ nome, claro: true, escuro: true });
      expect({ nome, mudou: c[nome] !== d[nome] }).toEqual({ nome, mudou: true });
    }
    const css = ler('public', 'css', 'tokens.css');
    for (const n of ['--nl-txt-600', '--nl-txt-700', '--nl-txt-800', '--nl-txt-900']) {
      expect(css).toMatch(new RegExp(`${n}:\\s*var\\(--nl-emerald-`));
      expect(d[n]).toBeDefined();
    }
  });

  test('no escuro, a superfície é mais escura que as tintas de texto e o fundo mais escuro que a superfície', () => {
    expect(luminancia(d['--nl-bg'])).toBeLessThan(luminancia(d['--nl-surface']));
    expect(luminancia(d['--nl-surface'])).toBeLessThan(luminancia(d['--nl-surface-2']));
    expect(luminancia(d['--nl-surface'])).toBeLessThan(0.05);
  });
});

/* ---------- cobertura e proteção ---------- */

const visoes = fs.readdirSync(path.join(RAIZ, 'src', 'Views')).filter((f) => f.endsWith('.html'));

describe('Tema — cobertura das páginas', () => {
  test.each(visoes)('%s aplica o tema antes de pintar e carrega o tema.css por último', (arq) => {
    const html = ler('src', 'Views', arq);
    const posScript = html.indexOf('/scripts/theme.js');
    const primeiroCss = html.search(/<link[^>]+rel="stylesheet"/);
    const posTema = html.indexOf('/css/tema.css');
    const ultimoCss = html.lastIndexOf('<link rel="stylesheet" href="/css/');
    expect(posScript).toBeGreaterThan(-1);
    expect(posScript).toBeLessThan(primeiroCss); // sem "piscar" claro antes de escurecer
    expect(posTema).toBeGreaterThan(-1);
    expect(posTema).toBeGreaterThanOrEqual(ultimoCss); // depois de todos os outros estilos do site
    expect(html.indexOf('</head>')).toBeGreaterThan(posTema);
  });

  test('a página de status do servidor e a offline também seguem o tema', () => {
    const { renderPaginaStatus } = require('../src/utils/paginaStatus');
    const html = renderPaginaStatus({ titulo: 'x', mensagem: 'y' });
    expect(html).toContain('/scripts/theme.js');
    expect(html).toContain('/css/tema.css');
    expect(ler('public', 'offline.html')).toContain('prefers-color-scheme: dark');
  });

  test('o tema.css tem chaves balanceadas e o seletor de tema do perfil existe', () => {
    const css = ler('public', 'css', 'tema.css');
    expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    const perfil = ler('src', 'Views', 'perfil.html');
    for (const modo of ['auto', 'claro', 'escuro']) expect(perfil).toContain(`data-tema-opcao="${modo}"`);
  });

  test('a folha "Mais" do celular tem o item de tema', () => {
    const js = ler('public', 'scripts', 'nav-mobile.js');
    expect(js).toContain('NLTema.alternar');
    expect(js).toContain("'Modo escuro'");
  });
});

describe('Tema — proteção contra cor fixa de volta', () => {
  // cores claras/escuras "de tema" que devem vir de variável, não de literal, nas propriedades de superfície/texto/borda
  const PROIBIDAS = /(?<![-\w])(background(?:-color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?)\s*:\s*[^;{}]*?(?<![\w#-])(#fff|#ffffff|white|#f8fafc|#f1f5f9|#e2e8f0|#ecfdf5|#d1fae5|#0f172a|#1e293b|#334155|#475569|#64748b)(?![\w-])/gi;

  test.each(fs.readdirSync(path.join(RAIZ, 'public', 'css')).filter((f) => !['tokens.css', 'tema.css'].includes(f)))('%s não usa cor fixa de tema', (arq) => {
    const css = ler('public', 'css', arq);
    const achados = [...css.matchAll(PROIBIDAS)]
      // texto branco (color: #fff) sobre botões/gradientes escuros é intencional e vale nos dois temas
      .filter((m) => !(m[1] === 'color' && /^(#fff|#ffffff|white)$/i.test(m[2])))
      .map((m) => m[0].slice(0, 90));
    expect(achados).toEqual([]);
  });

  test('gráficos do dashboard não usam mais cinzas fixos (mudam com o tema)', () => {
    const js = ler('public', 'scripts', 'dashboard.js');
    for (const hex of ['#0f172a', '#475569', '#e2e8f0', '#94a3b8']) expect(js).not.toContain(`'${hex}'`);
    expect(js).toContain('var(--nl-ink-900)');
    expect(js).toContain("style.setProperty(k, v)");
  });

  test('o theme.js não escreve o rótulo se ele não mudou (evita laço infinito com o MutationObserver)', () => {
    const js = ler('public', 'scripts', 'theme.js');
    expect(js).toMatch(/r\.textContent !== rotuloAtual\(\)/);
    expect(js).toMatch(/agendado/); // chamadas do observador são agrupadas
  });
});
