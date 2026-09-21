const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockDb = { legado: false, semChat: false, semFichas: false, consultas: [] };

jest.mock('../src/config/db', () => {
  const fichasRecentes = [
    { id: 11, objetivo: 'ganhar_massa', total_kcal: '2600', total_proteina: 160, total_carboidratos: 300, total_gordura: 80, total_fibra: 30, data_criacao: '2026-09-20T12:00:00.000Z' },
    { id: 10, objetivo: 'perder_peso', total_kcal: '1800', total_proteina: 84, total_carboidratos: 200, total_gordura: 50, total_fibra: 25, data_criacao: '2026-09-11T12:00:00.000Z' },
  ];

  class Request {
    constructor() {
      this.inputs = {};
    }
    input(k, _t, v) {
      this.inputs[k] = v;
      return this;
    }
    async query(q) {
      mockDb.consultas.push(q);

      if (q.includes('LEFT JOIN metasUsuario')) {
        return { recordset: [{ nome: 'Ana Souza', peso: 70, altura: 170, idade: 30, peso_alvo: 65, foco_principal: 'Hipertrofia' }] };
      }
      if (q.includes('COUNT(*) AS total FROM fichaAlimentar')) {
        return { recordset: [{ total: mockDb.semFichas ? 0 : 2 }] };
      }
      if (q.includes('FROM fichaAlimentar') && q.includes('TOP 12')) {
        return { recordset: mockDb.semFichas ? [] : fichasRecentes };
      }
      if (q.includes('FROM fichaAlimentos')) {
        const usaColunaNova = q.includes('ficha_id') && !q.includes('[fich-id]');
        if (mockDb.legado && usaColunaNova) {
          throw Object.assign(new Error("Invalid column name 'ficha_id'."), { number: 207 });
        }
        if (q.includes('GROUP BY')) {
          return { recordset: [{ nome_alimento: 'Arroz', vezes: 2 }, { nome_alimento: 'Feijão', vezes: 1 }] };
        }
        return {
          recordset: [
            { nome_alimento: 'Feijão', quantity_g: 100, meal_type: 'almoco', energia_kcal: '76' },
            { nome_alimento: 'Arroz', quantity_g: 200, meal_type: 'almoco', energia_kcal: '128' },
            { nome_alimento: 'Frango', quantity_g: 150, meal_type: 'jantar', energia_kcal: '165' },
            { nome_alimento: 'Sem dado', quantity_g: 50, meal_type: null, energia_kcal: 'NA' },
          ],
        };
      }
      if (q.includes('FROM chatHistorico')) {
        if (mockDb.semChat) throw Object.assign(new Error("Invalid object name 'chatHistorico'."), { number: 208 });
        return { recordset: [{ total: 12, favoritas: 3 }] };
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }

  return {
    sql: { Int: 'Int', VarChar: 'VarChar', NVarChar: 'NVarChar' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const {
  montarResumo,
  calcularIMC,
  classificarIMC,
  distribuirMacros,
  calcularProteina,
  calcularPeso,
  itensPorCalorias,
  caloriasPorRefeicao,
  mediaFichas,
} = require('../src/services/dashboardResumo');
const { calcularArcos, alturasBarras, CIRCUNFERENCIA } = require('../public/scripts/dashboard.js');

const auth = () => ({
  Authorization: `Bearer ${jwt.sign({ id: 1, email: 'a@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`,
});
const ler = (...partes) => fs.readFileSync(path.join(__dirname, '..', ...partes), 'utf8');

beforeEach(() => {
  mockDb.legado = false;
  mockDb.semChat = false;
  mockDb.semFichas = false;
  mockDb.consultas.length = 0;
});

describe('Dashboard — cálculos (dashboardResumo)', () => {
  test.each([
    [17.9, 'Abaixo do peso'],
    [18.5, 'Peso normal'],
    [24.9, 'Peso normal'],
    [25, 'Sobrepeso'],
    [29.9, 'Sobrepeso'],
    [30, 'Obesidade'],
  ])('IMC %s é "%s" (faixas da OMS)', (valor, classe) => {
    expect(classificarIMC(valor)).toBe(classe);
  });

  test('IMC = peso / altura² e aceita texto/vírgula (vêm do SQL)', () => {
    expect(calcularIMC(70, 170)).toEqual({ valor: 24.22, classificacao: 'Peso normal' });
    expect(calcularIMC('80,5', '180').valor).toBeCloseTo(24.85, 2);
  });

  test.each([[null, 170], [70, null], [0, 170], [70, 20], [70, 400], ['abc', 170]])(
    'IMC não é inventado com dado ausente/implausível (%j, %j)',
    (peso, altura) => {
      expect(calcularIMC(peso, altura)).toBeNull();
    }
  );

  test('macros: calorias por fator de Atwater (4/4/9) e percentuais fecham em 100', () => {
    const m = distribuirMacros({ proteina: 160, carboidratos: 300, gordura: 80 });

    expect(m.kcal_proteina).toBe(640);
    expect(m.kcal_carboidratos).toBe(1200);
    expect(m.kcal_gordura).toBe(720);
    expect(m.pct_proteina + m.pct_carboidratos + m.pct_gordura).toBe(100);
    expect(m).toMatchObject({ pct_proteina: 25, pct_carboidratos: 47, pct_gordura: 28 });
  });

  test('percentuais sempre somam 100, mesmo com arredondamento difícil', () => {
    for (const [p, c, g] of [[33, 33, 33], [10, 10, 10], [1, 2, 3], [7, 91, 13]]) {
      const m = distribuirMacros({ proteina: p, carboidratos: c, gordura: g });
      expect(m.pct_proteina + m.pct_carboidratos + m.pct_gordura).toBe(100);
    }
  });

  test('sem macros (zerados ou ausente) não há distribuição', () => {
    expect(distribuirMacros({ proteina: 0, carboidratos: 0, gordura: 0 })).toBeNull();
    expect(distribuirMacros(null)).toBeNull();
  });

  test('meta de proteína = peso × g/kg do objetivo', () => {
    expect(calcularProteina(70, 'ganhar_massa', 126)).toMatchObject({ meta_g: 126, percentual: 100, por_kg: 1.8 });
    expect(calcularProteina(70, 'Perder gordura', 49)).toMatchObject({ objetivo: 'perder_peso', meta_g: 98, percentual: 50 });
    expect(calcularProteina(null, 'perder_peso', 90)).toBeNull();
  });

  test('peso: diferença para o alvo e casos parciais', () => {
    expect(calcularPeso(70, 65)).toEqual({ atual: 70, alvo: 65, diferenca: 5 });
    expect(calcularPeso(60, 65).diferenca).toBe(-5);
    expect(calcularPeso(70, null)).toEqual({ atual: 70, alvo: null, diferenca: null });
    expect(calcularPeso(null, null)).toBeNull();
  });

  test('calorias dos itens: TACO é por 100 g, então kcal × gramas / 100; ordena e ignora sem dado', () => {
    const itens = itensPorCalorias([
      { nome_alimento: 'Feijão', quantity_g: 100, energia_kcal: '76' },
      { nome_alimento: 'Arroz', quantity_g: 200, energia_kcal: '128' },
      { nome_alimento: 'Sem dado', quantity_g: 50, energia_kcal: 'NA' },
    ]);

    expect(itens.map((i) => [i.nome, i.kcal])).toEqual([['Arroz', 256], ['Feijão', 76]]);
  });

  test('itens de ficha antiga (sem quantidade) contam como 100 g', () => {
    expect(itensPorCalorias([{ nome_alimento: 'Pão', energia_kcal: '270' }])[0]).toMatchObject({ quantidade_g: 100, kcal: 270 });
  });

  test('calorias por refeição somam só itens com refeição definida', () => {
    const r = caloriasPorRefeicao([
      { nome_alimento: 'A', quantity_g: 100, meal_type: 'almoco', energia_kcal: '100' },
      { nome_alimento: 'B', quantity_g: 200, meal_type: 'almoco', energia_kcal: '50' },
      { nome_alimento: 'C', quantity_g: 100, meal_type: 'jantar', energia_kcal: '300' },
      { nome_alimento: 'D', quantity_g: 100, meal_type: null, energia_kcal: '999' },
    ]);

    expect(r).toEqual([
      { refeicao: 'jantar', nome: 'Jantar', kcal: 300 },
      { refeicao: 'almoco', nome: 'Almoço', kcal: 200 },
    ]);
  });

  test('média das fichas', () => {
    expect(mediaFichas([{ kcal: 1000, proteina: 50 }, { kcal: 2000, proteina: 100 }])).toMatchObject({ kcal: 1500, proteina: 75 });
    expect(mediaFichas([])).toBeNull();
  });

  test('montarResumo sem nenhum dado devolve estrutura segura (sem quebrar)', () => {
    const r = montarResumo({});

    expect(r.fichas).toEqual({ total: 0, evolucao: [], ultima: null });
    expect(r.macros).toBeNull();
    expect(r.imc).toBeNull();
    expect(r.proteina).toBeNull();
    expect(r.chat).toEqual({ mensagens: 0, favoritas: 0 });
  });
});

describe('GET /api/dashboard/resumo', () => {
  test('exige login (401 sem token)', async () => {
    const res = await request(app).get('/api/dashboard/resumo');
    expect(res.status).toBe(401);
  });

  test('devolve o resumo completo do usuário logado', async () => {
    const res = await request(app).get('/api/dashboard/resumo').set(auth());

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.usuario).toMatchObject({ nome: 'Ana Souza', peso: 70, altura: 170 });
    expect(res.body.fichas.total).toBe(2);
    // gráfico em ordem cronológica (antiga → recente); a última é a de id 11
    expect(res.body.fichas.evolucao.map((f) => f.id)).toEqual([10, 11]);
    expect(res.body.fichas.ultima.id).toBe(11);
    expect(res.body.medias.kcal).toBe(2200);
    expect(res.body.macros).toMatchObject({ pct_proteina: 25, pct_carboidratos: 47, pct_gordura: 28 });
    expect(res.body.imc).toEqual({ valor: 24.22, classificacao: 'Peso normal' });
    expect(res.body.proteina).toMatchObject({ objetivo: 'ganhar_massa', meta_g: 126, percentual: 127 });
    expect(res.body.peso).toEqual({ atual: 70, alvo: 65, diferenca: 5 });
    expect(res.body.foco).toBe('Hipertrofia');
    expect(res.body.itens_ultima_ficha.map((i) => [i.nome, i.kcal])).toEqual([['Arroz', 256], ['Frango', 247.5], ['Feijão', 76]]);
    expect(res.body.refeicoes.map((r) => [r.refeicao, r.kcal])).toEqual([['almoco', 332], ['jantar', 247.5]]);
    expect(res.body.alimentos_frequentes).toEqual([{ nome: 'Arroz', vezes: 2 }, { nome: 'Feijão', vezes: 1 }]);
    expect(res.body.chat).toEqual({ mensagens: 12, favoritas: 3 });
  });

  test('só consulta dados do próprio usuário (id do token, nunca de parâmetro)', async () => {
    await request(app).get('/api/dashboard/resumo?id=999').set(auth());

    expect(mockDb.consultas.every((q) => !q.includes('999'))).toBe(true);
  });

  test('banco com o esquema antigo (coluna [fich-id]) continua funcionando', async () => {
    mockDb.legado = true;

    const res = await request(app).get('/api/dashboard/resumo').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.itens_ultima_ficha.length).toBeGreaterThan(0);
    expect(res.body.alimentos_frequentes.length).toBeGreaterThan(0);
    expect(mockDb.consultas.some((q) => q.includes('[fich-id]'))).toBe(true);
  });

  test('tabela do chat inexistente não derruba o dashboard (mensagens = 0)', async () => {
    mockDb.semChat = true;

    const res = await request(app).get('/api/dashboard/resumo').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.chat).toEqual({ mensagens: 0, favoritas: 0 });
  });

  test('usuário sem fichas recebe total 0 e listas vazias', async () => {
    mockDb.semFichas = true;

    const res = await request(app).get('/api/dashboard/resumo').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.fichas.total).toBe(0);
    expect(res.body.fichas.ultima).toBeNull();
    expect(res.body.macros).toBeNull();
    expect(res.body.itens_ultima_ficha).toEqual([]);
  });
});

describe('dashboard.js — geometria dos gráficos', () => {
  test('arcos do donut: comprimentos somam a circunferência menos as folgas', () => {
    const arcos = calcularArcos([25, 47, 28], CIRCUNFERENCIA, 2);
    const soma = arcos.reduce((s, a) => s + a.comprimento, 0);

    expect(soma).toBeCloseTo(CIRCUNFERENCIA - 3 * 2, 5);
    expect(arcos[0].deslocamento).toBe(0);
    expect(arcos[1].deslocamento).toBeCloseTo(-0.25 * CIRCUNFERENCIA, 5);
    expect(arcos[2].deslocamento).toBeCloseTo(-0.72 * CIRCUNFERENCIA, 5);
  });

  test('arco de 0% não tem comprimento negativo', () => {
    expect(calcularArcos([100, 0, 0], CIRCUNFERENCIA, 2).every((a) => a.comprimento >= 0)).toBe(true);
  });

  test('barras proporcionais ao maior valor, com folga no topo', () => {
    expect(alturasBarras([1000, 2000], 100)).toEqual([43, 87]);
  });

  test('barra com valor > 0 nunca some (altura mínima) e zero fica zerado', () => {
    const [pequena, zero] = alturasBarras([1, 100000, 0].slice(0, 1).concat([0]), 100);
    expect(pequena).toBeGreaterThanOrEqual(3);
    expect(zero).toBe(0);
  });
});

describe('Rotas: "/" apresentação, "/home" início do logado, "/dashboard" dashboard novo', () => {
  test('"/" é a apresentação pública', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/css/landing.css');
    expect(res.text).toContain('/scripts/landing.js');
    expect(res.text).toContain('Seu bem-estar começa com bons hábitos');
  });

  test('"/home" é o início de quem está logado (o antigo /dashboard)', async () => {
    const res = await request(app).get('/home');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/scripts/home-dados.js');
    expect(res.text).toContain('Objetivo Principal');
    expect(res.text).not.toContain('/css/landing.css');
    expect(res.text).toMatch(/<a href="\/home" class="active">/);
  });

  test('"/dashboard" é a página nova de gráficos', async () => {
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/scripts/dashboard.js');
    expect(res.text).toContain('/css/dashboard-graficos.css');
    expect(res.text).toContain('Distribuição de macros');
    expect(res.text).toMatch(/<a href="\/dashboard" class="active">/);
  });

  test('a página nova exige login (redireciona no front, sem token) e usa a API autenticada', () => {
    const js = ler('public', 'scripts', 'dashboard.js');

    expect(js).toContain("localStorage.getItem('token')");
    expect(js).toContain('NLVoltar.urlLogin()');
    expect(js).toContain("'/api/dashboard/resumo'");
  });

  test('dados do banco nunca entram por innerHTML no dashboard (nomes de alimentos não executam código)', () => {
    expect(ler('public', 'scripts', 'dashboard.js')).not.toMatch(/innerHTML\s*=/);
  });

  test('assets do dashboard são servidos', async () => {
    for (const rota of ['/scripts/dashboard.js', '/css/dashboard-graficos.css', '/scripts/home-dados.js', '/css/landing.css', '/scripts/landing.js']) {
      expect((await request(app).get(rota)).status).toBe(200);
    }
  });
});

describe('Barra lateral: "Início" (/home) e "Dashboard" (/dashboard) em todas as páginas', () => {
  test.each(['home', 'dashboard', 'minhas-fichas', 'rotulos'])('%s.html tem os dois itens', (pagina) => {
    const html = ler('src', 'Views', `${pagina}.html`);

    expect(html).toMatch(/<a href="\/home"[^>]*>.*Início/);
    expect(html).toMatch(/<a href="\/dashboard"[^>]*>.*Dashboard/);
  });

  test('a barra lateral injetada (sidebar.js) também tem os dois itens', () => {
    const js = ler('public', 'scripts', 'sidebar.js');

    expect(js).toContain("href: '/home'");
    expect(js).toContain("href: '/dashboard'");
  });

  test('nenhuma página ainda aponta o "Início" da apresentação para /home#...', () => {
    for (const arquivo of ['noticias.html', 'landing.html', 'chat.html']) {
      expect(ler('src', 'Views', arquivo)).not.toMatch(/href="\/home#/);
    }
    expect(ler('public', 'scripts', 'sidebar.js')).not.toMatch(/\/home#/);
  });

  test('login sem "voltar" leva ao /home', () => {
    expect(ler('src', 'Views', 'login.html')).toContain("NLVoltar.destino() : '/home'");
    expect(ler('public', 'scripts', 'voltar.js')).toContain("var PADRAO = '/home'");
  });
});
