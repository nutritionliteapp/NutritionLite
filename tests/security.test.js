const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockFakeDB = {
  fichas: [
    { id: 10, usuario_id: 1, objetivo: 'perder_peso' },
    { id: 20, usuario_id: 2, objetivo: 'ganhar_massa' },
  ],
  chat: [
    { id: 100, usuario_id: 1, favorita: 0 },
    { id: 200, usuario_id: 2, favorita: 0 },
  ],
  usuarios: [{ id: 1, email: 'a@test.com' }],
};

jest.mock('../src/config/db', () => {
  function mockHandleQuery(q, inputs) {
    if (q.includes('SELECT id FROM fichaAlimentar WHERE id = @id AND usuario_id')) {
      const found = mockFakeDB.fichas.filter(
        (f) => f.id === Number(inputs.id) && f.usuario_id === Number(inputs.usuario_id)
      );
      return { recordset: found, rowsAffected: [found.length] };
    }
    if (q.includes('DELETE FROM fichaAlimentos')) {
      return { recordset: [], rowsAffected: [1] };
    }
    if (q.includes('DELETE FROM fichaAlimentar WHERE id = @id AND usuario_id')) {
      const before = mockFakeDB.fichas.length;
      mockFakeDB.fichas = mockFakeDB.fichas.filter(
        (f) =>
          !(f.id === Number(inputs.id) && f.usuario_id === Number(inputs.usuario_id))
      );
      return { recordset: [], rowsAffected: [before - mockFakeDB.fichas.length] };
    }
    if (q.includes('UPDATE chatHistorico SET favorita = 1')) {
      const row = mockFakeDB.chat.find(
        (c) =>
          c.id === Number(inputs.id) && c.usuario_id === Number(inputs.usuario_id)
      );
      if (row) {
        row.favorita = 1;
        return { rowsAffected: [1], recordset: [] };
      }
      return { rowsAffected: [0], recordset: [] };
    }
    if (q.includes('SELECT id, email FROM usuarios WHERE email')) {
      const found = mockFakeDB.usuarios.filter((u) => u.email === inputs.email);
      return { recordset: found };
    }
    if (q.includes('UPDATE usuarios') && q.includes('reset_token')) {
      return { rowsAffected: [1], recordset: [] };
    }
    return { recordset: [], rowsAffected: [0] };
  }

  class Request {
    constructor() {
      this.inputs = {};
    }
    input(k, _t, v) {
      this.inputs[k] = v;
      return this;
    }
    async query(q) {
      return mockHandleQuery(q, this.inputs);
    }
  }

  class Transaction {
    async begin() {}
    async commit() {}
    async rollback() {}
  }

  const sql = {
    Int: jest.fn(),
    VarChar: jest.fn(),
    Float: jest.fn(),
    Request,
    Transaction,
  };
  const pool = {
    request() {
      return new Request();
    },
  };

  return { sql, poolPromise: Promise.resolve(pool) };
});

const app = require('../src/app');

function token(id, email = `u${id}@test.com`) {
  return jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Segurança — isolamento e auth', () => {
  test('usuário A não deleta ficha do usuário B (404)', async () => {
    const res = await request(app)
      .delete('/api/ficha/20')
      .set('Authorization', `Bearer ${token(1)}`);
    expect(res.status).toBe(404);
    expect(mockFakeDB.fichas.some((f) => f.id === 20)).toBe(true);
  });

  test('usuário A deleta a própria ficha', async () => {
    const res = await request(app)
      .delete('/api/ficha/10')
      .set('Authorization', `Bearer ${token(1)}`);
    expect(res.status).toBe(200);
    expect(mockFakeDB.fichas.some((f) => f.id === 10)).toBe(false);
  });

  test('usuário A não favorita chat do usuário B', async () => {
    const res = await request(app)
      .patch('/api/chat/favoritar/200')
      .set('Authorization', `Bearer ${token(1)}`);
    expect(res.status).toBe(404);
    expect(mockFakeDB.chat.find((c) => c.id === 200).favorita).toBe(0);
  });

  test('token inválido é rejeitado com 401', async () => {
    const res = await request(app)
      .get('/api/ficha/')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  test('recuperação não enumera e-mails (sempre 200 neutro)', async () => {
    const resExistente = await request(app)
      .post('/api/usuarios/recuperacaodesenha')
      .send({ email: 'a@test.com' });
    const resAusente = await request(app)
      .post('/api/usuarios/recuperacaodesenha')
      .send({ email: 'naoexiste@test.com' });

    expect(resExistente.status).toBe(200);
    expect(resAusente.status).toBe(200);
    expect(resExistente.body.mensagem).toBe(resAusente.body.mensagem);
  });

  test('endpoint de preços auto está desativado (410)', async () => {
    const res = await request(app).post('/api/preco/precos/auto');
    expect(res.status).toBe(410);
  });
});

describe('XSS — escaping', () => {
  test('escapeHtml trata markup como texto', () => {
    const code = fs.readFileSync(
      path.join(__dirname, '../public/scripts/domSafe.js'),
      'utf8'
    );
    const sandbox = {};
    // eslint-disable-next-line no-new-func
    new Function('window', code)(sandbox);
    const raw = '<img src=x onerror="alert(1)">';
    const out = sandbox.NLSafe.escapeHtml(raw);
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('<img');
  });
});
