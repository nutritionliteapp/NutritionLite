const request = require('supertest');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockUsuarios = {};
const mockTokenValido = require('crypto').createHash('sha256').update('token-valido', 'utf8').digest('hex');
const mockUpdates = [];

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
      if (q.includes('SELECT id, nome, email_confirmado, token_expira FROM usuarios')) {
        const u = mockUsuarios[this.inputs.email];
        return { recordset: u ? [u] : [] };
      }
      if (q.includes('SELECT id FROM usuarios WHERE token_confirmacao = @token')) {
        return { recordset: this.inputs.token === mockTokenValido ? [{ id: 9 }] : [] };
      }
      if (q.includes('email_confirmado = 1')) {
        return { rowsAffected: [1], recordset: [] };
      }
      if (q.includes('UPDATE usuarios') && q.includes('token_confirmacao = @token')) {
        mockUpdates.push({ ...this.inputs });
        return { rowsAffected: [1], recordset: [] };
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }
  return {
    sql: { Int: 'Int', VarChar: 'VarChar', DateTime: 'DateTime' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { enviarEmailConfirmacao } = require('../src/utils/emailService');

const HORA = 60 * 60 * 1000;
const reenviar = (email) => request(app).post('/api/usuarios/reenviar-confirmacao').send({ email });

beforeEach(() => {
  for (const k of Object.keys(mockUsuarios)) delete mockUsuarios[k];
  mockUpdates.length = 0;
  enviarEmailConfirmacao.mockClear();
});

describe('Reenvio do e-mail de confirmação', () => {
  test('conta não confirmada recebe novo link e o token novo substitui o antigo', async () => {
    mockUsuarios['ana@test.com'] = {
      id: 5,
      nome: 'Ana',
      email_confirmado: 0,
      // link anterior emitido há 10 min (expira em 50 min)
      token_expira: new Date(Date.now() + 50 * 60 * 1000),
    };

    const res = await reenviar('Ana@Test.com');

    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/enviamos um novo link/i);
    expect(enviarEmailConfirmacao).toHaveBeenCalledTimes(1);

    const [email, nome, token] = enviarEmailConfirmacao.mock.calls[0];
    expect(email).toBe('ana@test.com');
    expect(nome).toBe('Ana');

    // grava o HASH do token (o token cru só vai no e-mail) e renova a validade em 1 h
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0].id).toBe(5);
    expect(mockUpdates[0].token).toHaveLength(64);
    expect(mockUpdates[0].token).not.toBe(token);
    expect(mockUpdates[0].expira.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
    expect(mockUpdates[0].expira.getTime()).toBeLessThanOrEqual(Date.now() + HORA);
  });

  test('conta já confirmada: resposta idêntica e nenhum e-mail', async () => {
    mockUsuarios['ok@test.com'] = { id: 1, nome: 'Ok', email_confirmado: 1, token_expira: null };

    const res = await reenviar('ok@test.com');

    expect(res.status).toBe(200);
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled();
    expect(mockUpdates).toHaveLength(0);
  });

  test('e-mail inexistente: mesma resposta neutra (não revela quem tem conta)', async () => {
    const existente = (() => {
      mockUsuarios['a@test.com'] = { id: 2, nome: 'A', email_confirmado: 0, token_expira: null };
      return reenviar('a@test.com');
    })();
    const inexistente = reenviar('ninguem@test.com');

    const [a, b] = await Promise.all([existente, inexistente]);
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
  });

  test('intervalo mínimo de 1 minuto por conta: link recém-emitido não é reenviado', async () => {
    mockUsuarios['rapido@test.com'] = {
      id: 3,
      nome: 'Rápido',
      email_confirmado: 0,
      // emitido há 10 s (expira daqui a 59 min 50 s)
      token_expira: new Date(Date.now() + HORA - 10 * 1000),
    };

    const res = await reenviar('rapido@test.com');

    expect(res.status).toBe(200);
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled();
    expect(mockUpdates).toHaveLength(0);
  });

  test('falha no envio do e-mail não vaza erro (resposta neutra)', async () => {
    mockUsuarios['falha@test.com'] = { id: 4, nome: 'F', email_confirmado: 0, token_expira: null };
    enviarEmailConfirmacao.mockRejectedValueOnce(new Error('SMTP fora do ar'));

    const res = await reenviar('falha@test.com');

    expect(res.status).toBe(200);
    expect(res.body.mensagem).not.toMatch(/SMTP/);
  });

  test('e-mail em formato inválido devolve 400 com mensagem legível', async () => {
    const res = await reenviar('isto-nao-e-email');

    expect(res.status).toBe(400);
    expect(res.body.mensagem).toMatch(/email/i);
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled();
  });

  test('e-mail confirmado: a página traz o link para o login', async () => {
    const res = await request(app).get('/api/usuarios/confirmar-email/token-valido');

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/E-mail confirmado com sucesso/);
    expect(res.text).toContain('href="/login"');
  });

  test('token de confirmação inválido continua devolvendo 400', async () => {
    const res = await request(app).get('/api/usuarios/confirmar-email/token-errado');

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/inválido|expirado/i);
  });
});
