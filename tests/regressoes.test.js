const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockState = { queries: [], commits: 0, rollbacks: 0 };

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
      mockState.queries.push({ q, inputs: { ...this.inputs } });
      if (q.includes('SELECT * FROM usuarios WHERE id')) {
        return { recordset: [{ id: 1 }] };
      }
      if (q.includes('SELECT id, email FROM usuarios WHERE email')) {
        return { recordset: [{ id: 1, email: 'a@test.com' }] };
      }
      return { recordset: [], rowsAffected: [1] };
    }
  }

  class Transaction {
    async begin() {}
    async commit() {
      mockState.commits += 1;
    }
    async rollback() {
      mockState.rollbacks += 1;
    }
  }

  const sql = {
    Int: 'Int',
    VarChar: 'VarChar',
    Float: 'Float',
    Decimal: () => 'Decimal',
    Request,
    Transaction,
  };

  return {
    sql,
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { enviarEmail } = require('../src/utils/emailService');

const auth = () => ({
  Authorization: `Bearer ${jwt.sign({ id: 1, email: 'a@test.com' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  })}`,
});

const consultas = () => mockState.queries.map((x) => x.q);

beforeEach(() => {
  mockState.queries.length = 0;
  mockState.commits = 0;
  mockState.rollbacks = 0;
  enviarEmail.mockClear();
});

describe('CSP — recursos que as views realmente usam', () => {
  async function diretivas() {
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    return Object.fromEntries(
      csp.split(';').map((d) => {
        const [nome, ...valores] = d.trim().split(/\s+/);
        return [nome, valores];
      })
    );
  }

  test('libera onclick/onerror inline (script-src-attr)', async () => {
    expect((await diretivas())['script-src-attr']).toContain("'unsafe-inline'");
  });

  test('libera unpkg.com (Boxicons) em style-src e font-src', async () => {
    const d = await diretivas();
    expect(d['style-src']).toContain('https://unpkg.com');
    expect(d['font-src']).toContain('https://unpkg.com');
  });

  test('libera fontes do cdnjs (Font Awesome do login)', async () => {
    expect((await diretivas())['font-src']).toContain('https://cdnjs.cloudflare.com');
  });

  test('fora de produção não força upgrade-insecure-requests', async () => {
    expect(await diretivas()).not.toHaveProperty('upgrade-insecure-requests');
  });
});

describe('E-mail — normalização consistente (sem remover pontos de Gmail)', () => {
  test('login mantém os pontos do e-mail e só normaliza caixa/espaços', async () => {
    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ email: '  Joao.Silva@Gmail.com ', senha: 'Senha1234' });

    expect(res.status).toBe(401);
    const busca = mockState.queries.find((x) => x.q.includes('SELECT * FROM usuarios WHERE email'));
    expect(busca.inputs.email).toBe('joao.silva@gmail.com');
  });

  test('cadastro grava o e-mail exatamente como será usado no login', async () => {
    const res = await request(app)
      .post('/api/usuarios/cadastro')
      .send({ nome: 'Joao', email: 'Joao.Silva@Gmail.com', senha: 'Senha1234' });

    expect(res.status).toBe(201);
    const insert = mockState.queries.find((x) => x.q.includes('INSERT INTO usuarios'));
    expect(insert.inputs.email).toBe('joao.silva@gmail.com');
  });
});

describe('Erros de validação — mensagem legível pelo front-end', () => {
  test('cadastro com senha fraca devolve `mensagem` além de `errors`', async () => {
    const res = await request(app)
      .post('/api/usuarios/cadastro')
      .send({ nome: 'Ana', email: 'ana@test.com', senha: '123' });

    expect(res.status).toBe(400);
    expect(typeof res.body.mensagem).toBe('string');
    expect(res.body.mensagem.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('limite de tentativas de login (429) também traz `mensagem`', async () => {
    let ultima;
    for (let i = 0; i < 15; i++) {
      ultima = await request(app)
        .post('/api/usuarios/login')
        .send({ email: 'x@test.com', senha: 'Senha1234' });
      if (ultima.status === 429) break;
    }

    expect(ultima.status).toBe(429);
    expect(ultima.body.mensagem).toMatch(/tentativas de login/i);
    expect(ultima.body.message).toBe(ultima.body.mensagem);
  });
});

describe('Recuperação de senha — link', () => {
  test('usa BASE_URL (mesma precedência do e-mail de confirmação)', async () => {
    const anterior = process.env.BASE_URL;
    process.env.BASE_URL = 'https://app.exemplo.com/';
    try {
      const res = await request(app)
        .post('/api/usuarios/recuperacaodesenha')
        .send({ email: 'a@test.com' });

      expect(res.status).toBe(200);
      expect(enviarEmail).toHaveBeenCalledTimes(1);
      expect(enviarEmail.mock.calls[0][2]).toContain(
        'href="https://app.exemplo.com/novasenha?token='
      );
    } finally {
      if (anterior === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = anterior;
    }
  });
});

describe('Perfil e metas — campos vazios do formulário', () => {
  const atualizacao = () => mockState.queries.find((x) => x.q.includes('UPDATE usuarios SET nome'));

  test('campos numéricos vazios viram NULL (o front envia "")', async () => {
    const res = await request(app)
      .put('/api/usuarios/perfil')
      .set(auth())
      .send({ nome: '  Ana  ', peso: '', altura: '', idade: '' });

    expect(res.status).toBe(200);
    expect(atualizacao().inputs).toMatchObject({ nome: 'Ana', peso: null, altura: null, idade: null });
  });

  test('aceita vírgula decimal e arredonda altura/idade inteiras', async () => {
    const res = await request(app)
      .put('/api/usuarios/perfil')
      .set(auth())
      .send({ nome: 'Ana', peso: '70,5', altura: '178.4', idade: '30' });

    expect(res.status).toBe(200);
    expect(atualizacao().inputs).toMatchObject({ peso: 70.5, altura: 178, idade: 30 });
  });

  test.each([
    [{ nome: '', peso: '70' }, /nome/i],
    [{ nome: 'Ana', peso: 'abc' }, /números válidos/i],
    [{ nome: 'Ana', altura: '-5' }, /intervalo/i],
    [{ nome: 'Ana', idade: '999' }, /intervalo/i],
  ])('rejeita %j com 400', async (corpo, mensagem) => {
    const res = await request(app).put('/api/usuarios/perfil').set(auth()).send(corpo);

    expect(res.status).toBe(400);
    expect(res.body.mensagem).toMatch(mensagem);
    expect(atualizacao()).toBeUndefined();
  });

  test('metas: peso alvo vazio vira NULL e foco vazio vira NULL', async () => {
    const res = await request(app)
      .put('/api/usuarios/metas')
      .set(auth())
      .send({ peso_alvo: '', foco_principal: '   ' });

    expect(res.status).toBe(200);
    const upsert = mockState.queries.find((x) => x.q.includes('metasUsuario'));
    expect(upsert.inputs).toMatchObject({ peso_alvo: null, foco_principal: null });
  });

  test('metas: peso alvo inválido devolve 400', async () => {
    const res = await request(app)
      .put('/api/usuarios/metas')
      .set(auth())
      .send({ peso_alvo: 'muito', foco_principal: 'Hipertrofia' });

    expect(res.status).toBe(400);
  });
});

describe('Exclusão de conta', () => {
  test('apaga os dados dependentes antes do usuário, em uma transação', async () => {
    const res = await request(app).delete('/api/usuarios/deletar').set(auth());

    expect(res.status).toBe(200);
    expect(mockState.commits).toBe(1);
    expect(mockState.rollbacks).toBe(0);

    const q = consultas();
    const idx = (trecho) => q.findIndex((c) => c.includes(trecho));
    expect(idx('DELETE FROM fichaAlimentos')).toBeGreaterThan(-1);
    expect(idx('DELETE FROM fichaAlimentar')).toBeGreaterThan(idx('DELETE FROM fichaAlimentos'));
    expect(idx('DELETE FROM chatHistorico')).toBeGreaterThan(-1);
    expect(idx('DELETE FROM metasUsuario')).toBeGreaterThan(-1);
    expect(idx('DELETE FROM usuarios')).toBe(q.length - 1);
  });
});
