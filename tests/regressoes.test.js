const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title>
  <item><title>Matéria segura</title><link>https://exemplo.com/materia</link></item>
  <item><title>Matéria maliciosa</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: mockRss }),
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
      if (q.includes('INSERT INTO usuarios') && this.inputs.email === 'duplicado@test.com') {
        // Índice único violado (envio duplo simultâneo)
        throw Object.assign(new Error('Violation of UNIQUE KEY constraint'), { number: 2627 });
      }
      if (q.includes('FROM tbltacoNL')) {
        return {
          recordset: [
            { id_alimento: 1, nome_alimento: 'Alface', energia_kcal: '11', lipideos: '0,2', proteina: '1', fibra_alimentar: '2', sodio: '5' },
            { id_alimento: 2, nome_alimento: 'Sem dados', energia_kcal: 'Tr', lipideos: 'NA', proteina: 'NA', fibra_alimentar: 'NA', sodio: 'NA' },
            { id_alimento: 3, nome_alimento: 'Bacon', energia_kcal: '500', lipideos: '40', proteina: '15', fibra_alimentar: '0', sodio: '900' },
          ],
        };
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

describe('Sidebar do usuário logado nas páginas com navbar pública', () => {
  test.each(['/home', '/noticias'])(
    '%s carrega sidebar.css/sidebar.js e marca a navbar pública para ser trocada',
    async (rota) => {
      const res = await request(app).get(rota);

      expect(res.status).toBe(200);
      expect(res.text).toContain('/css/sidebar.css');
      expect(res.text).toContain('/scripts/sidebar.js');
      expect(res.text).toMatch(/<header[^>]*data-nav-publica/);
    }
  );

  test.each(['/taco', '/chat'])(
    '%s usa a navbar pública para visitantes (data-publica), a sidebar para logados e os avisos de cota',
    async (rota) => {
      const res = await request(app).get(rota);

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/<script src="\/scripts\/sidebar\.js" data-publica>/);
      expect(res.text).toContain('/scripts/limite.js');
      expect(res.text).toContain('/css/limite.css');
    }
  );

  test.each(['/perfil', '/ficha'])('%s (só logados) carrega a sidebar', async (rota) => {
    const res = await request(app).get(rota);

    expect(res.status).toBe(200);
    expect(res.text).toContain('/scripts/sidebar.js');
    expect(res.text).toContain('/css/sidebar.css');
  });

  test('assets da sidebar são servidos', async () => {
    expect((await request(app).get('/css/sidebar.css')).status).toBe(200);
    expect((await request(app).get('/scripts/sidebar.js')).status).toBe(200);
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
      // e-mail de recuperação: visual da marca (inline) e versão em texto com o link
      expect(enviarEmail.mock.calls[0][2]).toMatch(/background-color:#55e098/);
      expect(enviarEmail.mock.calls[0][3]).toContain('https://app.exemplo.com/novasenha?token=');
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

describe('Ficha — objetivo e recomendação', () => {
  test('criar ficha rejeita objetivo fora da lista (antes aceitava qualquer texto)', async () => {
    const res = await request(app)
      .post('/api/ficha/refeicao')
      .set(auth())
      .send({ objetivo: '<img src=x onerror=alert(1)>', alimentos: [{ food_id: '1', quantity_g: 100 }] });

    expect(res.status).toBe(400);
    expect(res.body.mensagem).toMatch(/perder_peso/);
  });

  test('perder peso não recomenda alimento sem dado numérico ("Tr"/"NA" virava 0 kcal)', async () => {
    const res = await request(app)
      .post('/api/ficha/recomendar')
      .set(auth())
      .send({ objetivo: 'perder_peso' });

    expect(res.status).toBe(200);
    expect(res.body.alimentos_recomendados.map((a) => a.nome_alimento)).toEqual(['Alface']);
  });

  test('recomendação lê a tabela inteira (sem TOP 200 arbitrário)', async () => {
    await request(app).post('/api/ficha/recomendar').set(auth()).send({ objetivo: 'ganhar_massa' });

    const consulta = consultas().find((q) => q.includes('FROM tbltacoNL'));
    expect(consulta).not.toMatch(/TOPs+200/i);
  });
});

describe('Cadastro duplo simultâneo', () => {
  test('violação do índice único responde neutro (201) em vez de 500', async () => {
    const res = await request(app)
      .post('/api/usuarios/cadastro')
      .send({ nome: 'Dup', email: 'duplicado@test.com', senha: 'Senha1234' });

    expect(res.status).toBe(201);
    expect(res.body.mensagem).toMatch(/Se o e-mail for elegível/);
  });
});

describe('Notícias — links do feed', () => {
  test('descarta itens cujo link não é http(s) (ex.: javascript:)', async () => {
    const res = await request(app).get('/api/noticias/feed');

    expect(res.status).toBe(200);
    const corpo = JSON.stringify(res.body);
    expect(corpo).toContain('https://exemplo.com/materia');
    expect(corpo).not.toMatch(/javascript:/i);
  });
});

describe('Limite de e-mails (cadastro + recuperação de senha)', () => {
  test('bloqueia com 429 e mensagem legível depois de muitas solicitações', async () => {
    let ultima;
    for (let i = 0; i < 20; i++) {
      ultima = await request(app)
        .post('/api/usuarios/recuperacaodesenha')
        .send({ email: 'a@test.com' });
      if (ultima.status === 429) break;
    }

    expect(ultima.status).toBe(429);
    expect(ultima.body.mensagem).toMatch(/solicitações de e-mail/i);
  });
});
