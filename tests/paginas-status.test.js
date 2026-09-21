const request = require('supertest');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

const mockTokenValido = require('crypto')
  .createHash('sha256')
  .update('token-valido', 'utf8')
  .digest('hex');

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
      if (q.includes('SELECT id FROM usuarios WHERE token_confirmacao = @token')) {
        return { recordset: this.inputs.token === mockTokenValido ? [{ id: 9 }] : [] };
      }
      return { recordset: [], rowsAffected: [1] };
    }
  }
  return {
    sql: { Int: 'Int', VarChar: 'VarChar' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { renderPaginaStatus } = require('../src/utils/paginaStatus');

const TEM_CSS = /<link rel="stylesheet" href="\/css\/status\.css">/;

describe('Páginas geradas pelo servidor têm CSS (antes eram texto/HTML solto)', () => {
  test('a raiz "/" abre a página inicial completa, não um texto solto', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('/css/landing.css');
    expect(res.text).not.toContain('Bem vindo à API');
  });

  test('endereço inexistente mostra a página 404 do sistema (não a do Express)', async () => {
    const res = await request(app).get('/pagina-que-nao-existe');

    expect(res.status).toBe(404);
    expect(res.text).toMatch(TEM_CSS);
    expect(res.text).toContain('Página não encontrada');
    expect(res.text).toContain('href="/"');
    expect(res.text).not.toMatch(/Cannot GET/);
  });

  test('asset inexistente também dá 404 (não 200)', async () => {
    const res = await request(app).get('/css/nao-existe.css');
    expect(res.status).toBe(404);
  });

  test('método diferente de GET em rota inexistente continua respondendo JSON', async () => {
    const res = await request(app).post('/nao-existe').send({});

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.sucesso).toBe(false);
  });

  test('rotas /api inexistentes continuam em JSON', async () => {
    const res = await request(app).get('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body.mensagem).toMatch(/não encontrada/i);
  });

  test.each(['login', 'home', 'chat', 'minhas-fichas'])(
    '/%s.html redireciona (301) para a rota sem extensão',
    async (pagina) => {
      const res = await request(app).get(`/${pagina}.html`);

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe(`/${pagina}`);
    }
  );

  test('o redirecionamento .html preserva a query string', async () => {
    const res = await request(app).get('/ficha.html?fichaId=12');

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/ficha?fichaId=12');
  });

  test('.html de página que não existe cai no 404 do sistema', async () => {
    const res = await request(app).get('/qualquer.html');

    expect(res.status).toBe(404);
    expect(res.text).toMatch(TEM_CSS);
  });
});

describe('Link de confirmação de e-mail — todas as respostas têm CSS', () => {
  test('sucesso', async () => {
    const res = await request(app).get('/api/usuarios/confirmar-email/token-valido');

    expect(res.status).toBe(200);
    expect(res.text).toMatch(TEM_CSS);
    expect(res.text).toContain('E-mail confirmado com sucesso!');
    expect(res.text).toContain('href="/login"');
    expect(res.text).toContain('status--sucesso');
  });

  test('link inválido ou expirado explica como pedir um novo', async () => {
    const res = await request(app).get('/api/usuarios/confirmar-email/token-errado');

    expect(res.status).toBe(400);
    expect(res.text).toMatch(TEM_CSS);
    expect(res.text).toMatch(/inválido ou expirado/i);
    expect(res.text).toMatch(/Reenviar e-mail de confirmação/);
    expect(res.text).toContain('status--erro');
  });
});

describe('renderPaginaStatus', () => {
  test('escapa o conteúdo (nada vira HTML)', () => {
    const html = renderPaginaStatus({
      titulo: '<img src=x onerror=alert(1)>',
      mensagem: '"><script>x()</script>',
      acoes: [{ texto: '<b>ir</b>', href: '/x" onclick="y()' }],
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>ir</b>');
    expect(html).not.toContain('href="/x" onclick');
  });

  test('tipo desconhecido cai em "info"', () => {
    expect(renderPaginaStatus({ titulo: 'a', mensagem: 'b', tipo: 'xyz' })).toContain('status--info');
  });

  test('a página é um documento completo com tokens e status.css', () => {
    const html = renderPaginaStatus({ titulo: 'a', mensagem: 'b' });

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('/css/tokens.css');
    expect(html).toContain('/css/status.css');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});
