const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

// Mock do módulo de e-mail pra não enviar nada real
jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

// Mock do pool de conexão com SQL Server
jest.mock('../src/config/db', () => {
  const sql = {
    VarChar: jest.fn(),
    DateTime: jest.fn(),
    Int: jest.fn(),
  };

  const fakeDB = {
    usuarios: [],
  };

  const poolPromise = Promise.resolve({
    request: jest.fn(() => {
      const requestObj = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn(async (query) => {
          // Simulação do INSERT (cadastro)
          if (query.includes('INSERT INTO usuarios')) {
            const novo = {
              id: fakeDB.usuarios.length + 1,
              nome: requestObj.nome,
              email: requestObj.email,
              senha_hash: requestObj.senha,
              email_confirmado: 0,
              token_confirmacao: requestObj.token,
            };
            fakeDB.usuarios.push(novo);
            return { recordset: [novo] };
          }

          // SELECT email existente
          if (query.includes('SELECT id FROM usuarios')) {
            const found = fakeDB.usuarios.filter(u => u.email === requestObj.email);
            return { recordset: found };
          }

          // SELECT para login
          if (query.includes('SELECT * FROM usuarios WHERE email = @email')) {
            const found = fakeDB.usuarios.filter(u => u.email === requestObj.email);
            return { recordset: found };
          }

          // UPDATE confirmação de email
          if (query.includes('UPDATE usuarios SET email_confirmado = 1')) {
            fakeDB.usuarios = fakeDB.usuarios.map(u =>
              u.id === requestObj.id ? { ...u, email_confirmado: 1 } : u
            );
            return { rowsAffected: [1] };
          }

          return { recordset: [] };
        }),
      };
      return requestObj;
    }),
  });

  return { sql, poolPromise };
});

describe('🧩 Testes de Usuário - Cadastro e Login', () => {
  let novoUsuario = {
    nome: 'Teste User',
    email: `teste${Date.now()}@exemplo.com`,
    senha: '123456',
  };

  test('✅ Deve cadastrar um novo usuário com sucesso', async () => {
    const res = await request(app)
      .post('/api/usuarios/cadastro')
      .send(novoUsuario);

    expect(res.statusCode).toBe(201);
    expect(res.body.mensagem).toMatch(/Usuário cadastrado/);
  });

  test('🚫 Deve bloquear login se o e-mail não estiver confirmado', async () => {
    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ email: novoUsuario.email, senha: novoUsuario.senha });

    expect(res.statusCode).toBe(403);
    expect(res.body.mensagem).toMatch(/Confirme seu e-mail/);
  });

  test('✅ Deve permitir login após confirmação de e-mail', async () => {
    // Mock manual de confirmação de e-mail
    const { poolPromise } = require('../src/config/db');
    const pool = await poolPromise;
    const req = pool.request();
    await req.input('id', 1).query('UPDATE usuarios SET email_confirmado = 1');

    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ email: novoUsuario.email, senha: novoUsuario.senha });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verifica se o token JWT é válido
    const decoded = jwt.decode(res.body.token);
    expect(decoded.email).toBe(novoUsuario.email);
  });
});
