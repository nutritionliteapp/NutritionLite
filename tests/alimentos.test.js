const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

const fakeToken = jwt.sign({ id: 1, email: 'teste@teste.com' }, process.env.JWT_SECRET || 'fake_secret', {
  expiresIn: '1h',
});

// Mock do banco de alimentos
jest.mock('../src/config/db', () => {
  const sql = { VarChar: jest.fn(), Int: jest.fn() };
  const poolPromise = Promise.resolve({
    request: () => {
      return {
        inputs: {},
        input(key, type, value) { this.inputs[key] = value; return this; },
        async query(q) {
          if (q.includes('SELECT * FROM tbltacoNL')) {
            return {
              recordset: [
                { id: 1, nome_alimento: 'banana', calorias: 89 },
                { id: 2, nome_alimento: 'maçã', calorias: 52 },
              ],
            };
          }
          if (q.includes('WHERE nome_alimento LIKE')) {
            const nome = this.inputs.nome.replace(/%/g, '').toLowerCase();
            const all = [
              { id: 1, nome_alimento: 'banana', calorias: 89 },
              { id: 2, nome_alimento: 'maçã', calorias: 52 },
            ];
            return { recordset: all.filter(a => a.nome_alimento.toLowerCase().includes(nome)) };
          }
          return { recordset: [] };
        },
      };
    },
  });
  return { sql, poolPromise };
});

describe("🍎 Testes da rota /api/alimentos", () => {
  jest.setTimeout(15000);

  test("Deve listar alimentos", async () => {
    const res = await request(app)
      .get("/api/alimentos/")
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("Deve buscar um alimento específico", async () => {
    const res = await request(app)
      .get("/api/alimentos/buscar?nome=banana")
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('nome_alimento', 'banana');
  });
});
