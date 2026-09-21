const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function arquivos(dir, extensoes) {
  const saida = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, nome.name);
    if (nome.isDirectory()) saida.push(...arquivos(caminho, extensoes));
    else if (extensoes.includes(path.extname(nome.name))) saida.push(caminho);
  }
  return saida;
}

/** Lê os tokens `--nl-*: #hex` de tokens.css. */
function carregarTokens() {
  const css = fs.readFileSync(path.join(RAIZ, 'public', 'css', 'tokens.css'), 'utf8');
  const tokens = {};
  for (const [, nome, valor] of css.matchAll(/(--nl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[nome] = valor.toLowerCase();
  }
  return tokens;
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

describe('Front-end — integridade dos arquivos', () => {
  test('nenhum arquivo de front tem marcador de conflito de merge do git', () => {
    const alvos = [
      ...arquivos(path.join(RAIZ, 'public'), ['.css', '.js', '.html']),
      ...arquivos(path.join(RAIZ, 'src'), ['.js', '.html']),
    ];
    const comConflito = alvos.filter((f) =>
      /^(<<<<<<< |=======$|>>>>>>> )/m.test(fs.readFileSync(f, 'utf8'))
    );

    expect(comConflito.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  test('as chaves { } de todo CSS estão balanceadas', () => {
    const desbalanceados = arquivos(path.join(RAIZ, 'public', 'css'), ['.css']).filter((f) => {
      const css = fs.readFileSync(f, 'utf8');
      return (css.match(/\{/g) || []).length !== (css.match(/\}/g) || []).length;
    });

    expect(desbalanceados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  test('toda página carrega o tokens.css antes dos demais estilos', () => {
    for (const arquivo of arquivos(path.join(RAIZ, 'src', 'Views'), ['.html'])) {
      const html = fs.readFileSync(arquivo, 'utf8');
      const posTokens = html.indexOf('/css/tokens.css');
      const primeiroCss = html.search(/href="\/css\/(?!tokens)/);

      expect({ arquivo: path.basename(arquivo), carrega: posTokens >= 0 }).toEqual({
        arquivo: path.basename(arquivo),
        carrega: true,
      });
      if (primeiroCss >= 0) expect(posTokens).toBeLessThan(primeiroCss);
    }
  });
});

describe('Design — contraste das combinações de cor (WCAG AA, texto normal ≥ 4,5:1)', () => {
  const t = carregarTokens();

  test.each([
    ['texto escuro sobre mint (botões, painel do login)', '--nl-on-mint', '--nl-mint-400'],
    ['texto escuro sobre mint claro (topo do painel do login)', '--nl-on-mint', '--nl-mint-300'],
    ['texto escuro sobre mint 500 (fim do gradiente do painel)', '--nl-on-mint', '--nl-mint-500'],
    ['branco sobre a cor de ação (botões)', '#ffffff', '--nl-action'],
    ['branco sobre a cor de ação em hover', '#ffffff', '--nl-action-hover'],
    ['esmeralda 700 sobre branco ("Entrar", logotipo, links)', '--nl-emerald-700', '#ffffff'],
    ['esmeralda 900 sobre branco (títulos de seção)', '--nl-emerald-900', '#ffffff'],
    ['texto de apoio (ink-500) sobre branco', '--nl-ink-500', '#ffffff'],
    ['texto secundário (ink-600) sobre branco', '--nl-ink-600', '#ffffff'],
    ['esmeralda 800 sobre esmeralda 50 (faixa de cota)', '--nl-emerald-800', '--nl-emerald-50'],
    ['erro sobre fundo de erro', '--nl-danger', '--nl-danger-bg'],
  ])('%s', (_descricao, frente, fundo) => {
    const cor = (v) => (v.startsWith('#') ? v : resolver(v));
    function resolver(nome) {
      let valor = t[nome];
      // alias como --nl-action: var(--nl-emerald-700)
      if (!valor) {
        const css = fs.readFileSync(path.join(RAIZ, 'public', 'css', 'tokens.css'), 'utf8');
        const m = css.match(new RegExp(`${nome}:\\s*var\\((--nl-[a-z0-9-]+)\\)`));
        valor = m ? t[m[1]] : undefined;
      }
      if (!valor) throw new Error(`token ${nome} não encontrado em tokens.css`);
      return valor;
    }

    expect(contraste(cor(frente), cor(fundo))).toBeGreaterThanOrEqual(4.5);
  });

  test('o branco sobre mint NÃO passa (é por isso que o texto sobre mint é escuro)', () => {
    expect(contraste('#ffffff', t['--nl-mint-400'])).toBeLessThan(3);
  });
});
