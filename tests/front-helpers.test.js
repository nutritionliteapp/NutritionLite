const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { calcularProteina, normalizarObjetivo, OBJETIVOS } = require('../public/scripts/dashboard-dados.js');

/** Executa public/scripts/voltar.js como o navegador faria, com um window falso. */
function carregarVoltar(pathname, search = '') {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'voltar.js'), 'utf8');
  const janela = { location: { pathname, search } };
  vm.runInNewContext(codigo, { window: janela, URLSearchParams });
  return janela.NLVoltar;
}

describe('Dashboard — objetivo e meta de proteína', () => {
  test.each([
    ['perder_peso', 'perder_peso'],
    ['ganhar_massa', 'ganhar_massa'],
    ['manter_saude', 'manter_saude'],
    ['Ganho de Massa', 'ganhar_massa'],
    ['Perder gordura', 'perder_peso'],
    ['Manter Saudável', 'manter_saude'],
    ['', null],
    [null, null],
    ['algo aleatório', null],
  ])('normalizarObjetivo(%j) -> %j', (entrada, esperado) => {
    expect(normalizarObjetivo(entrada)).toBe(esperado);
  });

  test('ficha e peso: percentual = proteína da ficha / (peso × g/kg do objetivo)', () => {
    const r = calcularProteina({ objetivo: 'ganhar_massa', peso: '70', total_proteina: 126 });

    expect(r.estado).toBe('ok');
    expect(r.porKg).toBe(OBJETIVOS.ganhar_massa.proteinaPorKg);
    expect(r.metaG).toBeCloseTo(126); // 70 kg × 1,8 g/kg
    expect(r.percentual).toBe(100);
  });

  test('aceita vírgula decimal e números como texto (vêm do SQL)', () => {
    const r = calcularProteina({ objetivo: 'perder_peso', peso: '80,5', total_proteina: '56,4' });

    expect(r.estado).toBe('ok');
    expect(r.metaG).toBeCloseTo(80.5 * 1.4);
    expect(r.percentual).toBe(50);
  });

  test('percentual pode passar de 100 (a barra é limitada no front, o número é real)', () => {
    expect(calcularProteina({ objetivo: 'manter_saude', peso: 60, total_proteina: 120 }).percentual).toBe(200);
  });

  test('sem peso: pede para informar o peso (não inventa uma meta)', () => {
    expect(calcularProteina({ objetivo: 'perder_peso', total_proteina: 90 }).estado).toBe('sem_peso');
    expect(calcularProteina({ objetivo: 'perder_peso', peso: 0, total_proteina: 90 }).estado).toBe('sem_peso');
  });

  test('com peso e sem ficha: mostra só a meta estimada', () => {
    const r = calcularProteina({ objetivo: 'perder_peso', peso: 70, total_proteina: null });

    expect(r.estado).toBe('sem_ficha');
    expect(r.metaG).toBeCloseTo(98);
  });

  test('sem objetivo usa o fator de manter a saúde', () => {
    expect(calcularProteina({ peso: 70, total_proteina: 70 }).porKg).toBe(OBJETIVOS.manter_saude.proteinaPorKg);
  });
});

describe('Voltar de onde parou depois do login (NLVoltar)', () => {
  test.each(['/chat', '/taco', '/noticias', '/dashboard', '/ficha', '/minhas-fichas', '/perfil', '/rotulos'])(
    'em %s o link de login carrega a página de origem',
    (pagina) => {
      expect(carregarVoltar(pagina).urlLogin()).toBe(`/login?voltar=${encodeURIComponent(pagina)}`);
    }
  );

  test('páginas fora da lista (home, login) não recebem ?voltar', () => {
    expect(carregarVoltar('/home').urlLogin()).toBe('/login');
    expect(carregarVoltar('/login').urlLogin()).toBe('/login');
  });

  test('barra final é tolerada', () => {
    expect(carregarVoltar('/chat/').urlLogin()).toBe('/login?voltar=%2Fchat');
  });

  test('destino devolve a página de origem quando permitida', () => {
    expect(carregarVoltar('/login', '?voltar=%2Fchat').destino()).toBe('/chat');
    expect(carregarVoltar('/login', '?voltar=/taco').destino()).toBe('/taco');
  });

  test('sem ?voltar o destino é o dashboard', () => {
    expect(carregarVoltar('/login', '').destino()).toBe('/dashboard');
  });

  test.each([
    'https://site-malicioso.com',
    '//site-malicioso.com',
    'javascript:alert(1)',
    '/api/usuarios/deletar',
    '/login',
    '/../chat',
    '',
  ])('rejeita destino não permitido %j (sem redirecionamento aberto)', (voltar) => {
    const busca = `?voltar=${encodeURIComponent(voltar)}`;
    expect(carregarVoltar('/login', busca).destino()).toBe('/dashboard');
  });
});
