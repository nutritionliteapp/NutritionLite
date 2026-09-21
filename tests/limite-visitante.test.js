const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockQueries = [];

// Estes testes medem só a cota diária do visitante: os limitadores por janela de 15 min
// (geral e do chat) têm testes próprios e estourariam com o volume de chamadas daqui.
jest.mock('../src/middlewares/rateLimiter', () => ({
  ...jest.requireActual('../src/middlewares/rateLimiter'),
  limiteGeral: (req, res, next) => next(),
  limiteChat: (req, res, next) => next(),
}));

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
      mockQueries.push(q);
      if (q.includes('FROM tbltacoNL')) {
        return { recordset: [{ id_alimento: 1, nome_alimento: 'Arroz', energia_kcal: '128' }] };
      }
      return { recordset: [], rowsAffected: [1] };
    }
  }
  return {
    sql: { Int: 'Int', NVarChar: 'NVarChar', VarChar: 'VarChar' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { _test } = require('../src/middlewares/limiteVisitante');

const tokenLogado = () =>
  jwt.sign({ id: 7, email: 'logado@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const buscarTaco = (token) => {
  const req = request(app).get('/api/alimentos/consulta?busca=arroz');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

// Mensagem que tem resposta pronta: não chama a IA, então o teste só exercita a cota.
const conversar = (corpo = {}, token) => {
  const req = request(app).post('/api/chat').send({ mensagem: 'ovo engorda?', ...corpo });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

beforeEach(() => {
  _test.contadores.clear();
  mockQueries.length = 0;
  delete process.env.LIMITE_DIARIO_VISITANTE;
});

describe('Cota diária do visitante — Tabela TACO', () => {
  test('visitante: 5 consultas com saldo decrescente e a 6ª é bloqueada (429)', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await buscarTaco();
      expect(res.status).toBe(200);
      expect(res.headers['x-limite-total']).toBe('5');
      expect(res.headers['x-limite-restantes']).toBe(String(5 - i));
    }

    const bloqueada = await buscarTaco();
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body).toMatchObject({
      limite_diario: true,
      recurso: 'taco',
      total: 5,
      restantes: 0,
    });
    expect(bloqueada.body.mensagem).toMatch(/acabaram/i);
    expect(bloqueada.headers['retry-after']).toBeDefined();
  });

  test('renovação é à meia-noite de Brasília (03:00 UTC) do dia seguinte', async () => {
    const res = await buscarTaco();
    const renova = new Date(res.headers['x-limite-renova-em']);

    expect(renova.getUTCHours()).toBe(3);
    expect(renova.getUTCMinutes()).toBe(0);
    expect(renova.getTime()).toBeGreaterThan(Date.now());
    expect(renova.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test('logado (JWT válido) é ilimitado e não recebe cabeçalhos de cota', async () => {
    for (let i = 0; i < 8; i++) {
      const res = await buscarTaco(tokenLogado());
      expect(res.status).toBe(200);
      expect(res.headers['x-limite-restantes']).toBeUndefined();
    }
  });

  test('logado continua livre mesmo depois da cota do visitante acabar', async () => {
    for (let i = 0; i < 5; i++) await buscarTaco();
    expect((await buscarTaco()).status).toBe(429);

    expect((await buscarTaco(tokenLogado())).status).toBe(200);
  });

  test('token inválido ou expirado conta como visitante', async () => {
    const expirado = jwt.sign({ id: 7 }, process.env.JWT_SECRET, { expiresIn: -10 });

    expect((await buscarTaco('lixo.lixo.lixo')).headers['x-limite-restantes']).toBe('4');
    expect((await buscarTaco(expirado)).headers['x-limite-restantes']).toBe('3');
  });

  test('a cota renova no dia seguinte', async () => {
    for (let i = 0; i < 5; i++) await buscarTaco();
    expect((await buscarTaco()).status).toBe(429);

    const agora = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(agora + 25 * 60 * 60 * 1000);
    try {
      const res = await buscarTaco();
      expect(res.status).toBe(200);
      expect(res.headers['x-limite-restantes']).toBe('4');
    } finally {
      spy.mockRestore();
    }
  });

  test('limite é configurável por LIMITE_DIARIO_VISITANTE', async () => {
    process.env.LIMITE_DIARIO_VISITANTE = '2';

    expect((await buscarTaco()).status).toBe(200);
    expect((await buscarTaco()).status).toBe(200);
    const res = await buscarTaco();
    expect(res.status).toBe(429);
    expect(res.body.total).toBe(2);
  });
});

describe('Cota diária do visitante — Chat', () => {
  test('visitante conversa sem login, 5 vezes por dia, e a 6ª é bloqueada', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await conversar();
      expect(res.status).toBe(200);
      expect(res.body.resposta).toMatch(/ovo é uma ótima fonte de proteína/i);
      expect(res.headers['x-limite-restantes']).toBe(String(5 - i));
    }

    const bloqueada = await conversar();
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body).toMatchObject({ limite_diario: true, recurso: 'chat', restantes: 0 });
  });

  test('conversa de visitante não é gravada no banco', async () => {
    const res = await conversar();

    expect(res.status).toBe(200);
    expect(mockQueries.some((q) => q.includes('INSERT INTO chatHistorico'))).toBe(false);
  });

  test('logado: sem limite diário e conversa gravada', async () => {
    for (let i = 0; i < 7; i++) {
      const res = await conversar({}, tokenLogado());
      expect(res.status).toBe(200);
      expect(res.headers['x-limite-restantes']).toBeUndefined();
    }
    expect(mockQueries.some((q) => q.includes('INSERT INTO chatHistorico'))).toBe(true);
  });

  test('requisição inválida (400) não gasta a cota', async () => {
    const invalida = await conversar({ modo: 'hackerman' });
    expect(invalida.status).toBe(400);

    const valida = await conversar();
    expect(valida.status).toBe(200);
    expect(valida.headers['x-limite-restantes']).toBe('4'); // e não 3
  });

  test('cota do chat e da TACO são independentes', async () => {
    for (let i = 0; i < 5; i++) await conversar();
    expect((await conversar()).status).toBe(429);

    const taco = await buscarTaco();
    expect(taco.status).toBe(200);
    expect(taco.headers['x-limite-restantes']).toBe('4');
  });
});

describe('GET /api/uso/:recurso — saldo sem consumir', () => {
  test('visitante vê o saldo e consultar não gasta cota', async () => {
    await conversar();

    const a = await request(app).get('/api/uso/chat');
    const b = await request(app).get('/api/uso/chat');

    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ recurso: 'chat', ilimitado: false, total: 5, restantes: 4 });
    expect(new Date(a.body.renova_em).getUTCHours()).toBe(3);
    expect(b.body.restantes).toBe(4);
  });

  test('logado aparece como ilimitado', async () => {
    const res = await request(app)
      .get('/api/uso/taco')
      .set('Authorization', `Bearer ${tokenLogado()}`);

    expect(res.body).toEqual({ recurso: 'taco', ilimitado: true });
  });

  test('recurso desconhecido retorna 404', async () => {
    expect((await request(app).get('/api/uso/rotulos')).status).toBe(404);
  });
});

describe('Datas da cota (fuso de Brasília)', () => {
  test('o "dia" vira à meia-noite de Brasília, não à de UTC', () => {
    expect(_test.diaDeBrasilia(Date.UTC(2026, 8, 20, 2, 59))).toBe('2026-09-19'); // 23:59 em Brasília
    expect(_test.diaDeBrasilia(Date.UTC(2026, 8, 20, 3, 0))).toBe('2026-09-20'); // 00:00 em Brasília
  });

  test('próxima renovação = próxima 00:00 de Brasília', () => {
    expect(_test.proximaRenovacao(Date.UTC(2026, 8, 20, 15, 0)).toISOString()).toBe(
      '2026-09-21T03:00:00.000Z'
    );
    expect(_test.proximaRenovacao(Date.UTC(2026, 8, 20, 2, 59)).toISOString()).toBe(
      '2026-09-20T03:00:00.000Z'
    );
  });
});
