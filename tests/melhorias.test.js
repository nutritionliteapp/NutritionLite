/** Sugestões de alimentos, metas precisas, evolução, lembretes, prévia de compartilhamento e endurecimento de produção. */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/middlewares/rateLimiter', () => ({
  ...jest.requireActual('../src/middlewares/rateLimiter'),
  limiteGeral: (req, res, next) => next(),
}));

const mockEnviarPush = jest.fn();
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: (...args) => mockEnviarPush(...args),
}));

let mockManipulador = () => ({ recordset: [], rowsAffected: [1] });
const mockConsultas = [];

jest.mock('../src/config/db', () => {
  class Request {
    constructor() {
      this.inputs = {};
    }
    input(k, _t, v) {
      this.inputs[k] = v;
      return this;
    }
    async query(q) {
      mockConsultas.push({ q, inputs: { ...this.inputs } });
      return mockManipulador(q, this.inputs);
    }
  }
  return {
    sql: { Int: 'Int', VarChar: 'VarChar', NVarChar: 'NVarChar', Char: 'Char', Decimal: () => 'Decimal', Float: 'Float' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { recomendar, ehComidaDeVerdade } = require('../src/services/recomendacao');
const metas = require('../src/services/metasDiarias');
const evolucao = require('../src/services/evolucao');
const lembretes = require('../src/services/lembretes');
const { validateEnv } = require('../src/config/env');

const RAIZ = path.join(__dirname, '..');
const token = (id = 7) => jwt.sign({ id, email: 'a@a.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (req) => req.set('Authorization', `Bearer ${token()}`);

beforeEach(() => {
  mockConsultas.length = 0;
  mockEnviarPush.mockReset();
  mockManipulador = () => ({ recordset: [], rowsAffected: [1] });
});

describe('Sugestões de alimentos', () => {
  const linha = (nome, kcal, prot, lip, fibra, sodio) => ({ nome_alimento: nome, energia_kcal: kcal, proteina: prot, lipideos: lip, fibra_alimentar: fibra, sodio });
  const TACO = [
    linha('Refrigerante, tipo cola', '34', '0', '0', '0', '4'),
    linha('Refresco de caju, pó', '39', '0', '0', '0', '30'),
    linha('Gelatina, pó', '380', '0', '0', '0', '100'),
    linha('Alface, crespa, crua', '11', '1.3', '0.2', '1.8', '9'),
    linha('Tomate, com semente, cru', '15', '1.1', '0.2', '1.2', '5'),
    linha('Brócolis, cozido', '25', '2.1', '0.5', '3.4', '5'),
    linha('Frango, peito, sem pele, grelhado', '159', '32', '2.5', '0', '50'),
    linha('Linguiça, frango, frita', '260', '17', '18', '0', '900'),
    linha('Ovo, de galinha, inteiro, cozido', '146', '13.3', '9.5', '0', '146'),
    linha('Feijão, carioca, cozido', '76', '4.8', '0.5', '8.5', '2'),
    linha('Maçã, Fuji, com casca, crua', '56', '0.3', '0', '1.3', '0'),
    linha('Sem dado numérico', 'Tr', 'NA', 'Tr', 'NA', 'NA'),
  ];
  const nomes = (l) => l.map((x) => x.nome_alimento);

  test('bebidas açucaradas, pós, gelatinas e embutidos nunca são sugeridos (o bug do "refrigerante para emagrecer")', () => {
    for (const objetivo of ['perder_peso', 'ganhar_massa', 'manter_saude']) {
      const todos = recomendar(TACO, objetivo, { quantidade: 50, sorteio: () => 0 });
      const ruins = nomes(todos).filter((n) => /refrigerante|refresco|gelatina|lingui/i.test(n));
      expect({ objetivo, ruins }).toEqual({ objetivo, ruins: [] });
    }
    expect(ehComidaDeVerdade({ nome_alimento: 'Refrigerante, tipo cola' })).toBe(false);
    expect(ehComidaDeVerdade({ nome_alimento: 'Arroz, integral, cozido' })).toBe(true);
    expect(ehComidaDeVerdade({ nome_alimento: 'Molho de tomate' })).toBe(false);
    // leguminosas/cereais crus e ervas desidratadas não são comida pronta (nomes com vírgula e com hífen, como na base real)
    for (const n of ['Feijão, carioca, cru', 'Feijao-preto-cru', 'Tremoco-cru', 'Coentro-folhas-desidratadas', 'Bacalhau, salgado']) {
      expect({ n, ok: ehComidaDeVerdade({ nome_alimento: n }) }).toEqual({ n, ok: false });
    }
    for (const n of ['Feijao-preto-cozido', 'Alface, crespa, crua', 'Banana-prata-crua', 'Ervilha-em-vagem']) {
      expect({ n, ok: ehComidaDeVerdade({ nome_alimento: n }) }).toEqual({ n, ok: true });
    }
  });

  test('perder peso: leves e nutritivos; ganhar massa: ricos em proteína; manter saúde: com fibra e pouco sódio', () => {
    expect(nomes(recomendar(TACO, 'perder_peso', { quantidade: 50, sorteio: () => 0 }))).toEqual(
      expect.arrayContaining(['Alface, crespa, crua', 'Brócolis, cozido'])
    );
    const massa = nomes(recomendar(TACO, 'ganhar_massa', { quantidade: 50, sorteio: () => 0 }));
    expect(massa).toEqual(expect.arrayContaining(['Frango, peito, sem pele, grelhado']));
    expect(massa).not.toContain('Alface, crespa, crua');
    const saude = nomes(recomendar(TACO, 'manter_saude', { quantidade: 50, sorteio: () => 0 }));
    expect(saude).toEqual(expect.arrayContaining(['Feijão, carioca, cozido']));
  });

  test('"Tr"/"NA" não viram zero: alimento sem dado numérico fica de fora', () => {
    for (const o of ['perder_peso', 'ganhar_massa', 'manter_saude']) {
      expect(nomes(recomendar(TACO, o, { quantidade: 50, sorteio: () => 0 }))).not.toContain('Sem dado numérico');
    }
  });

  test('devolve a quantidade pedida, varia com o sorteio e ignora objetivo desconhecido', () => {
    expect(recomendar(TACO, 'perder_peso')).toHaveLength(2);
    expect(recomendar(TACO, 'objetivo_falso')).toEqual([]);
    expect(recomendar([], 'perder_peso')).toEqual([]);
    const a = nomes(recomendar(TACO, 'perder_peso', { sorteio: () => 0 }));
    const b = nomes(recomendar(TACO, 'perder_peso', { sorteio: () => 0.99 }));
    expect(a).not.toEqual(b);
  });
});

describe('Metas com sexo e atividade', () => {
  const base = { peso: 70, altura: 170, idade: 30, objetivo: 'manter_saude' };

  test('homem gasta mais que mulher; mais atividade, mais calorias; sem dados usa o ponto médio', () => {
    const homem = metas.calcularMetas({ ...base, sexo: 'M', nivel_atividade: 'moderado' });
    const mulher = metas.calcularMetas({ ...base, sexo: 'F', nivel_atividade: 'moderado' });
    const medio = metas.calcularMetas({ ...base, nivel_atividade: 'moderado' });
    expect(homem.kcal).toBeGreaterThan(medio.kcal);
    expect(medio.kcal).toBeGreaterThan(mulher.kcal);
    const sedentario = metas.calcularMetas({ ...base, sexo: 'M', nivel_atividade: 'sedentario' }).kcal;
    const intenso = metas.calcularMetas({ ...base, sexo: 'M', nivel_atividade: 'intenso' }).kcal;
    expect(intenso).toBeGreaterThan(sedentario * 1.3);
  });

  test('valores conhecidos (Mifflin-St Jeor × fator) e marcação de precisão', () => {
    // 10*70 + 6,25*170 - 5*30 + 5 = 1617,5 ; × 1,55 = 2507 (manter)
    expect(metas.calcularMetas({ ...base, sexo: 'M', nivel_atividade: 'moderado' }).kcal).toBe(2507);
    expect(metas.calcularMetas({ ...base, sexo: 'M', nivel_atividade: 'moderado' }).precisao).toBe('completa');
    expect(metas.calcularMetas(base).precisao).toBe('media');
    expect(metas.calcularMetas({ ...base, sexo: 'X', nivel_atividade: 'voar' }).precisao).toBe('media'); // valores estranhos são ignorados
  });

  test('o piso de segurança continua valendo', () => {
    expect(metas.calcularMetas({ peso: 40, altura: 150, idade: 70, objetivo: 'perder_peso', sexo: 'F', nivel_atividade: 'sedentario' }).kcal).toBeGreaterThanOrEqual(metas.KCAL_MINIMA);
  });
});

describe('Evolução (dashboard)', () => {
  test('diário de 30 dias: completa os dias sem registro e calcula adesão, média e dias na meta', () => {
    const r = evolucao.resumirDiario(
      [
        { data: '2026-09-26', kcal: 2000, proteina: 90 },
        { data: '2026-09-25', kcal: 1900 },
        { data: '2026-09-24', kcal: 3200 },
        { data: '2026-08-01', kcal: 999 }, // fora da janela
      ],
      { kcal: 2000 },
      '2026-09-26'
    );
    expect(r.dias).toHaveLength(30);
    expect(r.dias[29]).toMatchObject({ data: '2026-09-26', kcal: 2000 });
    expect(r.dias[0].data).toBe('2026-08-28');
    expect(r.dias_registrados).toBe(3);
    expect(r.aderencia_pct).toBe(10);
    expect(r.media_kcal).toBe(2367);
    expect(r.dias_na_meta).toBe(2); // 2000 e 1900; 3200 passou
    expect(evolucao.resumirDiario([], null, '2026-09-26').dias_na_meta).toBeNull();
  });

  test('peso: variação, alvo e descarte de valores inválidos', () => {
    const r = evolucao.resumirPeso([{ data: '2026-01-01', peso: '80,5' }, { data: '2026-02-01', peso: null }, { data: '2026-03-01', peso: 77 }], '70');
    expect(r.pontos).toHaveLength(2);
    expect(r.variacao).toBe(-3.5);
    expect(r.alvo).toBe(70);
    expect(evolucao.resumirPeso([], null).pontos).toEqual([]);
  });

  test('a API do dashboard devolve as séries mesmo sem as tabelas novas (migrations pendentes)', async () => {
    mockManipulador = (q) => {
      if (/FROM usuarios u/.test(q) && /peso_alvo/.test(q)) return { recordset: [{ nome: 'Ana', peso: 70, altura: 170, idade: 30, peso_alvo: 65, foco_principal: 'x' }] };
      if (/FROM usuarios u/.test(q)) return { recordset: [{ nome: 'Ana', peso: 70, altura: 170, idade: 30, objetivo: 'manter_saude' }] };
      if (/diarioRefeicoes|pesoHistorico/.test(q)) {
        const e = new Error('Invalid object name'); e.number = 208; throw e;
      }
      return { recordset: [] };
    };
    const res = await auth(request(app).get('/api/dashboard/resumo'));
    expect(res.status).toBe(200);
    expect(res.body.diario30.dias).toHaveLength(30);
    expect(res.body.diario30.dias_registrados).toBe(0);
    expect(res.body.peso_serie.pontos).toEqual([]);
  });
});

describe('Perfil: sexo, atividade e histórico de peso', () => {
  const corpo = { nome: 'Ana', peso: 70, altura: 170, idade: 30, sexo: 'f', nivel_atividade: 'Moderado' };

  test('grava sexo/atividade normalizados e registra o peso do dia (uma linha por dia)', async () => {
    const res = await auth(request(app).put('/api/usuarios/perfil')).send(corpo);
    expect(res.status).toBe(200);
    const up = mockConsultas.find((c) => c.q.includes('UPDATE usuarios'));
    expect(up.q).toMatch(/sexo = @sexo/);
    expect(up.inputs.sexo).toBe('F');
    expect(up.inputs.atividade).toBe('moderado');
    expect(mockConsultas.some((c) => c.q.includes('MERGE pesoHistorico'))).toBe(true);
  });

  test('rejeita sexo e atividade inválidos', async () => {
    expect((await auth(request(app).put('/api/usuarios/perfil')).send({ ...corpo, sexo: 'Z' })).status).toBe(400);
    expect((await auth(request(app).put('/api/usuarios/perfil')).send({ ...corpo, nivel_atividade: 'astronauta' })).status).toBe(400);
  });

  test('sem a migration 007 o perfil continua salvando o que já era suportado', async () => {
    mockManipulador = (q) => {
      if (q.includes('UPDATE usuarios') && q.includes('sexo')) {
        const e = new Error("Invalid column name 'sexo'."); e.number = 207; throw e;
      }
      if (q.includes('pesoHistorico')) {
        const e = new Error('Invalid object name'); e.number = 208; throw e;
      }
      return { recordset: [], rowsAffected: [1] };
    };
    const res = await auth(request(app).put('/api/usuarios/perfil')).send(corpo);
    expect(res.status).toBe(200);
    expect(mockConsultas.filter((c) => c.q.includes('UPDATE usuarios')).length).toBe(2); // tentou com e sem as colunas novas
  });

  test('só mexe em sexo/atividade quando o formulário os envia', async () => {
    await auth(request(app).put('/api/usuarios/perfil')).send({ nome: 'Ana', peso: 70, altura: 170, idade: 30 });
    const up = mockConsultas.find((c) => c.q.includes('UPDATE usuarios'));
    expect(up.q).not.toMatch(/sexo/);
  });
});

describe('Lembretes: regras', () => {
  test('normaliza horários: válidos, únicos, em ordem, no máximo 4', () => {
    expect(lembretes.normalizarHorarios(['19:00', '12:00', '12:00', '25:00', 'abc', '07:30'])).toEqual(['07:30', '12:00', '19:00']);
    expect(lembretes.normalizarHorarios('08:00,20:00')).toEqual(['08:00', '20:00']);
    expect(lembretes.normalizarHorarios(['01:00', '02:00', '03:00', '04:00', '05:00'])).toHaveLength(4);
    expect(lembretes.normalizarHorarios(null)).toEqual([]);
  });

  test('janela de 10 min depois do horário, no máximo uma vez por horário por dia (fuso de Brasília)', () => {
    const l = { horarios: '12:00,19:00', ultimo_envio_data: null, ultimo_envio_hora: null };
    const em = (hhmm, data = '2026-09-26') => ({ data, hhmm });
    expect(lembretes.horarioDevido(l, em('11:59'))).toBeNull();
    expect(lembretes.horarioDevido(l, em('12:00'))).toBe('12:00');
    expect(lembretes.horarioDevido(l, em('12:09'))).toBe('12:00');
    expect(lembretes.horarioDevido(l, em('12:10'))).toBeNull();
    expect(lembretes.horarioDevido({ ...l, ultimo_envio_data: '2026-09-26', ultimo_envio_hora: '12:00' }, em('12:03'))).toBeNull();
    expect(lembretes.horarioDevido({ ...l, ultimo_envio_data: '2026-09-25', ultimo_envio_hora: '12:00' }, em('12:03'))).toBe('12:00');
    // 15:00 UTC = 12:00 em Brasília
    expect(lembretes.agoraBrasilia(Date.UTC(2026, 8, 26, 15, 0))).toEqual({ data: '2026-09-26', hhmm: '12:00' });
    expect(lembretes.agoraBrasilia(Date.UTC(2026, 8, 26, 1, 30))).toEqual({ data: '2026-09-25', hhmm: '22:30' });
  });

  test('texto muda conforme a hora', () => {
    expect(lembretes.mensagemPara('08:00').corpo).toMatch(/café da manhã/i);
    expect(lembretes.mensagemPara('12:00').corpo).toMatch(/almoço/i);
    expect(lembretes.mensagemPara('16:00').corpo).toMatch(/lanche/i);
    expect(lembretes.mensagemPara('20:00').corpo).toMatch(/jantar/i);
    expect(lembretes.mensagemPara('12:00').url).toBe('/diario');
  });

  test('o ciclo do agendador envia, pula quem acabou de registrar, remove assinatura expirada e não repete', async () => {
    const agora = Date.UTC(2026, 8, 26, 15, 2); // 12:02 em Brasília
    const linhas = [
      { id: 1, usuario_id: 10, endpoint: 'https://push/1', p256dh: 'a', auth: 'b', horarios: '12:00', ultimo_envio_data: null, ultimo_envio_hora: null },
      { id: 2, usuario_id: 11, endpoint: 'https://push/2', p256dh: 'a', auth: 'b', horarios: '12:00', ultimo_envio_data: null, ultimo_envio_hora: null },
      { id: 3, usuario_id: 12, endpoint: 'https://push/3', p256dh: 'a', auth: 'b', horarios: '12:00', ultimo_envio_data: null, ultimo_envio_hora: null },
      { id: 4, usuario_id: 13, endpoint: 'https://push/4', p256dh: 'a', auth: 'b', horarios: '19:00', ultimo_envio_data: null, ultimo_envio_hora: null },
    ];
    mockManipulador = (q) => {
      if (q.includes('FROM lembretes')) return { recordset: linhas };
      if (q.includes('FROM diarioRefeicoes')) return { recordset: [{ usuario_id: 11 }] }; // 11 registrou há pouco
      return { recordset: [], rowsAffected: [1] };
    };
    const enviarFn = jest.fn(async (l) => (l.id === 3 ? 'expirada' : 'ok'));

    const r = await lembretes.processarLembretes({ agora, enviarFn });
    expect(r).toEqual({ avaliados: 4, enviados: 1, removidos: 1 });
    expect(enviarFn).toHaveBeenCalledTimes(2); // 1 e 3 (11 foi pulado; 4 não está no horário)
    expect(enviarFn.mock.calls[0][1].corpo).toMatch(/almoço/i);
    expect(mockConsultas.some((c) => c.q.includes('DELETE FROM lembretes') && c.inputs.id === 3)).toBe(true);
    const marcados = mockConsultas.filter((c) => c.q.includes('UPDATE lembretes SET ultimo_envio_data')).map((c) => c.inputs.id);
    expect(marcados.sort()).toEqual([1, 2]); // enviado e "resolvido" (pulado); o expirado foi removido
  });

  test('agendador não liga sem VAPID nem em teste', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(lembretes.configurado()).toBe(false);
    expect(lembretes.iniciarAgendador()).toBe(false);
  });
});

describe('Lembretes: API', () => {
  const assinatura = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  test('exige login; sem VAPID informa indisponível e recusa salvar', async () => {
    expect((await request(app).get('/api/lembretes/config')).status).toBe(401);
    const cfg = await auth(request(app).get('/api/lembretes/config'));
    expect(cfg.body.disponivel).toBe(false);
    expect((await auth(request(app).put('/api/lembretes')).send({ subscription: assinatura })).status).toBe(503);
  });

  test('com VAPID: expõe só a chave pública, valida a assinatura e grava por hash do endpoint', async () => {
    process.env.VAPID_PUBLIC_KEY = 'CHAVE_PUBLICA_TESTE';
    process.env.VAPID_PRIVATE_KEY = 'CHAVE_PRIVADA_SECRETA';
    const cfg = await auth(request(app).get('/api/lembretes/config'));
    expect(cfg.body).toMatchObject({ disponivel: true, chave_publica: 'CHAVE_PUBLICA_TESTE' });
    expect(JSON.stringify(cfg.body)).not.toContain('SECRETA');

    for (const ruim of [
      {},
      { subscription: { endpoint: 'http://inseguro.com/x', keys: assinatura.keys } },
      { subscription: { endpoint: 'https://ok.com/x', keys: { p256dh: '<script>', auth: 'x' } } },
      { subscription: { endpoint: `https://ok.com/${'a'.repeat(1300)}`, keys: assinatura.keys } },
    ]) {
      expect((await auth(request(app).put('/api/lembretes')).send(ruim)).status).toBe(400);
    }

    const ok = await auth(request(app).put('/api/lembretes')).send({ subscription: assinatura, horarios: ['19:00', '08:00', 'lixo'] });
    expect(ok.status).toBe(200);
    expect(ok.body.horarios).toEqual(['08:00', '19:00']);
    const merge = mockConsultas.find((c) => c.q.includes('MERGE lembretes'));
    expect(merge.inputs.usuario_id).toBe(7);
    expect(merge.inputs.hash).toBe(lembretes.hashEndpoint(assinatura.endpoint));
    expect(merge.inputs.horarios).toBe('08:00,19:00');
  });

  test('remover e estado só mexem nas assinaturas do próprio usuário', async () => {
    await auth(request(app).delete('/api/lembretes')).send({ endpoint: assinatura.endpoint });
    const del = mockConsultas.find((c) => c.q.includes('DELETE FROM lembretes'));
    expect(del.q).toMatch(/usuario_id = @usuario_id/);
    expect(del.inputs.usuario_id).toBe(7);

    mockManipulador = () => ({ recordset: [{ horarios: '12:00,19:00', ativo: true }] });
    const est = await auth(request(app).post('/api/lembretes/estado')).send({ endpoint: assinatura.endpoint });
    expect(est.body).toEqual({ ativo: true, horarios: ['12:00', '19:00'] });
  });

  test('teste: entrega para os aparelhos do usuário e apaga assinatura expirada', async () => {
    process.env.VAPID_PUBLIC_KEY = 'x';
    process.env.VAPID_PRIVATE_KEY = 'y';
    mockManipulador = () => ({ recordset: [{ id: 1, endpoint: 'https://push/1', p256dh: 'a', auth: 'b' }] });
    mockEnviarPush.mockResolvedValueOnce({ statusCode: 201 });
    expect((await auth(request(app).post('/api/lembretes/teste'))).status).toBe(200);
    expect(JSON.parse(mockEnviarPush.mock.calls[0][1]).corpo).toMatch(/Funcionou/);

    mockEnviarPush.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const gone = await auth(request(app).post('/api/lembretes/teste'));
    expect(gone.status).toBe(502);
    expect(mockConsultas.some((c) => c.q.includes('DELETE FROM lembretes WHERE id'))).toBe(true);
  });

  test('sem assinatura ativa o teste explica o que fazer', async () => {
    process.env.VAPID_PUBLIC_KEY = 'x';
    process.env.VAPID_PRIVATE_KEY = 'y';
    expect((await auth(request(app).post('/api/lembretes/teste'))).status).toBe(404);
  });

  test('service worker mostra a notificação e só abre caminhos do próprio site', () => {
    const sw = fs.readFileSync(path.join(RAIZ, 'public', 'sw.js'), 'utf8');
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain("startsWith('/')");
  });
});

describe('Prévia de compartilhamento (Open Graph)', () => {
  test('landing, login e privacidade têm imagem e endereço absolutos, sem marcador sobrando', async () => {
    for (const rota of ['/', '/login', '/privacidade']) {
      const res = await request(app).get(rota).set('Host', 'nutritionlite.exemplo.com');
      expect(res.status).toBe(200);
      expect(res.text).toContain('property="og:image" content="http://nutritionlite.exemplo.com/imgs/og-image.png"');
      expect(res.text).toContain('twitter:card');
      expect(res.text).not.toContain('__BASE_URL__');
    }
    expect(fs.existsSync(path.join(RAIZ, 'public', 'imgs', 'og-image.png'))).toBe(true);
  });

  test('PUBLIC_URL tem prioridade e um Host malicioso nunca é refletido no HTML', async () => {
    const ruim = await request(app).get('/').set('Host', 'x"><script>alert(1)</script>');
    expect(ruim.text).not.toContain('alert(1)');
    process.env.PUBLIC_URL = 'https://meu-site.com.br/';
    const fixo = await request(app).get('/').set('Host', 'qualquer.com');
    expect(fixo.text).toContain('content="https://meu-site.com.br/imgs/og-image.png"');
    delete process.env.PUBLIC_URL;
  });
});

describe('Endurecimento para produção', () => {
  const ambiente = { ...process.env };
  afterEach(() => {
    process.env = { ...ambiente };
  });
  const valido = () => Object.assign(process.env, { DB_USER: 'u', DB_PASSWORD: 'p', DB_SERVER: 's', DB_NAME: 'd' });

  test('em produção um JWT_SECRET curto impede o boot; em desenvolvimento só avisa', () => {
    valido();
    process.env.JWT_SECRET = 'a'.repeat(20);
    process.env.NODE_ENV = 'production';
    const prod = validateEnv({ exitOnError: false });
    expect(prod.ok).toBe(false);
    expect(prod.errors.join(' ')).toMatch(/npm run segredo/);

    process.env.NODE_ENV = 'development';
    expect(validateEnv({ exitOnError: false }).ok).toBe(true);

    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(validateEnv({ exitOnError: false }).ok).toBe(true);
  });

  test('.env.example documenta as variáveis sem nenhum valor secreto; scripts de segredo e VAPID existem', () => {
    const exemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
    for (const v of ['JWT_SECRET', 'DB_PASSWORD', 'GEMINI_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PUBLIC_URL']) {
      expect(exemplo).toMatch(new RegExp(`^${v}=`, 'm'));
    }
    expect(exemplo).not.toMatch(/^(JWT_SECRET|DB_PASSWORD|GEMINI_API_KEY|EMAIL_PASS|VAPID_PRIVATE_KEY)=\S+/m);
    const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
    expect(pkg.scripts.segredo).toBeDefined();
    expect(pkg.scripts.vapid).toBeDefined();
    expect(pkg.scripts.migrar).toBeDefined();
    expect(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });

  test('migration 007 cria colunas e tabelas de forma idempotente', () => {
    const sqlTxt = fs.readFileSync(path.join(RAIZ, 'migrations', '007_metas_peso_lembretes.sql'), 'utf8');
    for (const trecho of ["COL_LENGTH('dbo.usuarios', 'sexo')", "COL_LENGTH('dbo.usuarios', 'nivel_atividade')", "OBJECT_ID('dbo.pesoHistorico'", "OBJECT_ID('dbo.lembretes'", 'UQ_lembretes_endpoint']) {
      expect(sqlTxt).toContain(trecho);
    }
  });
});
