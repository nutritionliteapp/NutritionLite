/** Cota de visitante persistida no banco (migration 005): sobrevive a reinício e cai para memória se o banco falhar. */
process.env.NODE_ENV = 'test';
process.env.LIMITE_VISITANTE_DB = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';

const mockConsultas = [];
let mockUsadoNoBanco = 0;
let mockBancoFalha = false;

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
      if (mockBancoFalha) {
        const e = new Error("Invalid object name 'usoVisitante'.");
        e.number = 208;
        throw e;
      }
      mockConsultas.push({ q, inputs: { ...this.inputs } });
      if (q.includes('SELECT usado')) return { recordset: mockUsadoNoBanco ? [{ usado: mockUsadoNoBanco }] : [] };
      return { recordset: [], rowsAffected: [1] };
    }
  }
  return { sql: { VarChar: 'VarChar', Int: 'Int' }, poolPromise: Promise.resolve({ request: () => new Request() }) };
});

const { limiteDiarioVisitante, _test } = require('../src/middlewares/limiteVisitante');

function chamar(req = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      on() {},
      status(c) { this.statusCode = c; return this; },
      json(corpo) { resolve({ status: this.statusCode, corpo }); },
    };
    limiteDiarioVisitante('chat')({ headers: {}, ip: '9.9.9.9', ...req }, res, () => resolve({ status: 200 }));
  });
}

beforeEach(() => {
  _test.contadores.clear();
  mockConsultas.length = 0;
  mockUsadoNoBanco = 0;
  mockBancoFalha = false;
});

test('lê do banco o que já foi usado hoje (reinício do servidor não zera a cota)', async () => {
  mockUsadoNoBanco = 5;
  const r = await chamar();
  expect(r.status).toBe(429);
  expect(mockConsultas.some((c) => c.q.includes('SELECT usado'))).toBe(true);
});

test('cada uso é espelhado no banco com MERGE (upsert atômico por chave/dia)', async () => {
  mockUsadoNoBanco = 2;
  expect((await chamar()).status).toBe(200);
  await new Promise((r) => setImmediate(r));
  const merge = mockConsultas.find((c) => c.q.includes('MERGE usoVisitante'));
  expect(merge).toBeDefined();
  expect(merge.inputs.usado).toBe(3);
  expect(merge.inputs.chave).toMatch(/^chat:[0-9a-f]{24}$/); // só o hash, nunca o IP
  expect(JSON.stringify(mockConsultas)).not.toContain('9.9.9.9');
});

test('se a tabela não existir, o limite continua valendo em memória', async () => {
  mockBancoFalha = true;
  for (let i = 0; i < 5; i++) expect((await chamar()).status).toBe(200);
  expect((await chamar()).status).toBe(429);
});
