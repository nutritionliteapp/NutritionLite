const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockAtualizarObjetivo = jest.fn((req, res) =>
  res.status(200).json({ mensagem: 'objetivo-ok', rota: 'objetivo' })
);
const mockAtualizarFicha = jest.fn((req, res) =>
  res.status(200).json({ mensagem: 'ficha-ok', id: req.params.id })
);
const mockBuscarFicha = jest.fn((req, res) =>
  res.status(200).json({ id: req.params.id })
);

jest.mock('../src/controllers/fichaController', () => ({
  criarFicha: jest.fn((req, res) => res.status(201).json({})),
  listarFichas: jest.fn((req, res) => res.status(200).json([])),
  buscarFichaPorId: (...args) => mockBuscarFicha(...args),
  atualizarFicha: (...args) => mockAtualizarFicha(...args),
  deletarFicha: jest.fn((req, res) => res.status(200).json({})),
  recomendarDieta: jest.fn((req, res) => res.status(200).json({})),
  atualizarObjetivoFicha: (...args) => mockAtualizarObjetivo(...args),
}));

jest.mock('../src/config/db', () => {
  const requestFactory = () => ({
    input() {
      return this;
    },
    async query() {
      return { recordset: [{ dataHora: new Date().toISOString() }], rowsAffected: [1] };
    },
  });
  return {
    sql: { Int: jest.fn(), VarChar: jest.fn(), DateTime: jest.fn() },
    poolPromise: Promise.resolve({ request: requestFactory }),
  };
});

const app = require('../src/app');

function tokenFor(id = 1) {
  return jwt.sign({ id, email: 'a@test.com' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

describe('Rotas de ficha — específica vs parametrizada', () => {
  beforeEach(() => {
    mockAtualizarObjetivo.mockClear();
    mockAtualizarFicha.mockClear();
    mockBuscarFicha.mockClear();
  });

  test('PUT /api/ficha/objetivo chega ao controller de objetivo (não a /:id)', async () => {
    const res = await request(app)
      .put('/api/ficha/objetivo')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ objetivo: 'perder_peso' });

    expect(res.status).toBe(200);
    expect(res.body.rota).toBe('objetivo');
    expect(mockAtualizarObjetivo).toHaveBeenCalledTimes(1);
    expect(mockAtualizarFicha).not.toHaveBeenCalled();
  });

  test('PUT /api/ficha/objetivo com objetivo inválido retorna 400', async () => {
    const res = await request(app)
      .put('/api/ficha/objetivo')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ objetivo: 'invalido' });

    expect(res.status).toBe(400);
    expect(mockAtualizarObjetivo).not.toHaveBeenCalled();
  });

  test('PUT /api/ficha/:id ainda funciona para IDs numéricos', async () => {
    const res = await request(app)
      .put('/api/ficha/42')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({
        objetivo: 'manter_saude',
        alimentos: ['Arroz'],
      });

    expect(res.status).toBe(200);
    expect(mockAtualizarFicha).toHaveBeenCalledTimes(1);
    expect(mockAtualizarObjetivo).not.toHaveBeenCalled();
  });
});

describe('Health / error handlers', () => {
  test('GET /api/teste/conexao usa poolPromise e retorna 200', async () => {
    const res = await request(app).get('/api/teste/conexao');
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
  });

  test('rota API inexistente retorna 404 JSON', async () => {
    const res = await request(app).get('/api/rota-que-nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.sucesso).toBe(false);
    expect(res.body.mensagem).toMatch(/não encontrada/i);
  });
});
