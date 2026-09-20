const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

// Mock do módulo de e-mail
jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

// Mock do banco de dados SQL Server
jest.mock('../src/config/db', () => {
  const sql = { VarChar: jest.fn(), DateTime: jest.fn(), Int: jest.fn() };
  const fakeDB = { usuarios: [] };

  const poolPromise = Promise.resolve({
    request: () => {
      const requestObj = {
        inputs: {},
        input(key, type, value) {
          this.inputs[key] = value;
          return this;
        },
        async query(q) {
          if (q.includes('INSERT INTO usuarios')) {
            const novo = {
              id: fakeDB.usuarios.length + 1,
              nome: this.inputs.nome,
              email: this.inputs.email,
              senha_hash: this.inputs.senha,
              email_confirmado: 0,
              token_confirmacao: this.inputs.token,
            };
            fakeDB.usuarios.push(novo);
            return { recordset: [novo] };
          }

          if (q.includes('SELECT * FROM usuarios WHERE email = @email')) {
            const found = fakeDB.usuarios.filter(u => u.email === this.inputs.email);
            return { recordset: found };
          }

          if (q.includes('UPDATE usuarios SET email_confirmado = 1')) {
            fakeDB.usuarios = fakeDB.usuarios.map(u =>
              u.email === this.inputs.email ? { ...u, email_confirmado: 1 } : u
            );
            return { rowsAffected: [1] };
          }

          return { recordset: [] };
        }
      };
      return requestObj;
    }
  });

  return { sql, poolPromise };
});

describe('🧩 Testes de Usuário - Cadastro e Login', () => {
  const novoUsuario = {
    nome: 'Teste User',
    email: `teste${Date.now()}@exemplo.com`,
    senha: 'Senha1234',
  };
  let jwtToken;

  test('✅ Deve cadastrar um novo usuário com sucesso', async () => {
    const res = await request(app).post('/api/usuarios/cadastro').send(novoUsuario);
    expect(res.statusCode).toBe(201);
    expect(res.body.mensagem).toMatch(/confirmação|e-mail|email/i);
  });

  test('🚫 Deve bloquear login se o e-mail não estiver confirmado', async () => {
    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ email: novoUsuario.email, senha: novoUsuario.senha });
    expect(res.statusCode).toBe(403);
    expect(res.body.mensagem).toMatch(/Confirme seu e-mail/);
  });

  test('✅ Deve permitir login após confirmação de e-mail', async () => {
    const { poolPromise } = require('../src/config/db');
    const pool = await poolPromise;
    const req = pool.request();
    req.input('email', null, novoUsuario.email.toLowerCase());
    await req.query('UPDATE usuarios SET email_confirmado = 1');

    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ email: novoUsuario.email, senha: novoUsuario.senha });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();

    jwtToken = res.body.token;
    const decoded = jwt.decode(jwtToken);
    expect(decoded.email).toBe(novoUsuario.email.toLowerCase());
  });

  test('🔑 Deve acessar rota protegida usando JWT', async () => {
    const res = await request(app)
      .get('/api/alimentos/')
      .set('Authorization', `Bearer ${jwtToken}`);
    expect(res.statusCode).toBe(200);
  });
});
