/** Foto de perfil, sessão deslizante e navegação mobile. */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/middlewares/rateLimiter', () => ({
  ...jest.requireActual('../src/middlewares/rateLimiter'),
  limiteGeral: (req, res, next) => next(),
}));

let mockManipulador = () => ({ recordset: [], rowsAffected: [0] });
const mockConsultas = [];

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
      mockConsultas.push({ q, inputs: { ...this.inputs } });
      return mockManipulador(q, this.inputs);
    }
  }
  return {
    sql: { Int: 'Int', VarChar: 'VarChar', NVarChar: 'NVarChar', VarBinary: 'VarBinary' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');
const { tipoPelaAssinatura, MAX_BYTES } = require('../src/controllers/fotoController');

const RAIZ = path.join(__dirname, '..');
const token = (id = 7) => jwt.sign({ id, email: 'a@a.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (req) => req.set('Authorization', `Bearer ${token()}`);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP'), Buffer.alloc(100, 3)]);
const dataUrl = (buf, tipo = 'image/jpeg') => `data:${tipo};base64,${buf.toString('base64')}`;

beforeEach(() => {
  mockConsultas.length = 0;
  mockManipulador = () => ({ recordset: [], rowsAffected: [1] });
});

describe('Foto de perfil', () => {
  test('exige login em todas as rotas', async () => {
    expect((await request(app).get('/api/usuarios/foto')).status).toBe(401);
    expect((await request(app).put('/api/usuarios/foto').send({})).status).toBe(401);
    expect((await request(app).delete('/api/usuarios/foto')).status).toBe(401);
  });

  test('reconhece JPEG, PNG e WebP pela assinatura do arquivo', () => {
    expect(tipoPelaAssinatura(JPEG)).toBe('image/jpeg');
    expect(tipoPelaAssinatura(PNG)).toBe('image/png');
    expect(tipoPelaAssinatura(WEBP)).toBe('image/webp');
    expect(tipoPelaAssinatura(Buffer.from('<svg onload=alert(1)></svg>'))).toBeNull();
    expect(tipoPelaAssinatura(Buffer.from('GIF89a......'))).toBeNull();
  });

  test('salva com MERGE, gravando o tipo REAL (não o informado) e só para o próprio usuário', async () => {
    const res = await auth(request(app).put('/api/usuarios/foto')).send({ imagem: dataUrl(PNG, 'image/jpeg') });
    expect(res.status).toBe(200);
    const merge = mockConsultas.find((c) => c.q.includes('MERGE fotosPerfil'));
    expect(merge.inputs.usuario_id).toBe(7);
    expect(merge.inputs.tipo).toBe('image/png'); // o cliente disse jpeg, os bytes dizem png
    expect(Buffer.isBuffer(merge.inputs.dados)).toBe(true);
    expect(merge.inputs.dados.equals(PNG)).toBe(true);
  });

  test('aceita também { base64, mimeType }', async () => {
    const res = await auth(request(app).put('/api/usuarios/foto')).send({ imagem: { base64: JPEG.toString('base64'), mimeType: 'image/jpeg' } });
    expect(res.status).toBe(200);
  });

  test.each([
    ['sem imagem', {}, 400],
    ['SVG disfarçado de imagem', { imagem: `data:image/jpeg;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}` }, 400],
    ['formato não permitido', { imagem: dataUrl(JPEG, 'image/gif') }, 400],
    ['base64 inválido', { imagem: 'data:image/jpeg;base64,@@@###' }, 400],
    ['grande demais', { imagem: dataUrl(Buffer.concat([JPEG, Buffer.alloc(MAX_BYTES + 10)])) }, 413],
  ])('recusa: %s', async (_d, corpo, status) => {
    const res = await auth(request(app).put('/api/usuarios/foto')).send(corpo);
    expect(res.status).toBe(status);
    expect(mockConsultas.some((c) => c.q.includes('MERGE fotosPerfil'))).toBe(false);
  });

  test('devolve os bytes com o tipo certo e sem cache compartilhado', async () => {
    mockManipulador = () => ({ recordset: [{ tipo: 'image/jpeg', dados: JPEG }] });
    const res = await auth(request(app).get('/api/usuarios/foto')).buffer(true).parse((r, cb) => {
      const partes = [];
      r.on('data', (c) => partes.push(c));
      r.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body, JPEG)).toBe(0);
    expect(mockConsultas[0].inputs.usuario_id).toBe(7);
  });

  test('sem foto e sem a migration 006: 204 (o front mostra as iniciais), nunca 500', async () => {
    expect((await auth(request(app).get('/api/usuarios/foto'))).status).toBe(204);
    mockManipulador = () => {
      const e = new Error("Invalid object name 'fotosPerfil'.");
      e.number = 208;
      throw e;
    };
    expect((await auth(request(app).get('/api/usuarios/foto'))).status).toBe(204);
    const put = await auth(request(app).put('/api/usuarios/foto')).send({ imagem: dataUrl(JPEG) });
    expect(put.status).toBe(503);
    expect(put.body.migracao_pendente).toBe(true);
  });

  test('remover apaga só a foto do próprio usuário', async () => {
    const res = await auth(request(app).delete('/api/usuarios/foto'));
    expect(res.status).toBe(200);
    const del = mockConsultas.find((c) => c.q.includes('DELETE FROM fotosPerfil'));
    expect(del.q).toMatch(/usuario_id = @usuario_id/);
    expect(del.inputs.usuario_id).toBe(7);
  });

  test('a exclusão da conta e a exportação de dados também cobrem a foto', () => {
    const fonte = fs.readFileSync(path.join(RAIZ, 'src', 'controllers', 'userController.js'), 'utf8');
    expect(fonte).toMatch(/DELETE FROM fotosPerfil WHERE usuario_id/);
    expect(fonte).toMatch(/FROM fotosPerfil WHERE usuario_id = @id/);
    expect(fs.readFileSync(path.join(RAIZ, 'migrations', '006_foto_perfil.sql'), 'utf8')).toMatch(/CREATE TABLE dbo\.fotosPerfil/);
  });
});

describe('Sessão deslizante', () => {
  test('renova um token válido para usuário que existe', async () => {
    mockManipulador = () => ({ recordset: [{ id: 7, email: 'a@a.com' }] });
    const res = await auth(request(app).post('/api/usuarios/renovar'));
    expect(res.status).toBe(200);
    const novo = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(novo.id).toBe(7);
    expect(novo.exp * 1000).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('não renova token ausente, expirado, adulterado nem de usuário apagado', async () => {
    expect((await request(app).post('/api/usuarios/renovar')).status).toBe(401);
    const expirado = jwt.sign({ id: 7 }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect((await request(app).post('/api/usuarios/renovar').set('Authorization', `Bearer ${expirado}`)).status).toBe(401);
    expect((await request(app).post('/api/usuarios/renovar').set('Authorization', `Bearer ${token()}x`)).status).toBe(401);
    mockManipulador = () => ({ recordset: [] });
    expect((await auth(request(app).post('/api/usuarios/renovar'))).status).toBe(401);
  });
});

describe('Front: avatar, sessão e barra flutuante', () => {
  const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

  test('todas as páginas logadas carregam o perfil-ui.js (ou o sidebar.js, que o carrega)', () => {
    for (const v of ['home', 'dashboard', 'minhas-fichas', 'rotulos', 'diario', 'cardapio', 'perfil', 'login']) {
      expect({ v, ok: ler('src', 'Views', `${v}.html`).includes('perfil-ui.js') }).toEqual({ v, ok: true });
    }
    expect(ler('public', 'scripts', 'sidebar.js')).toContain('/scripts/perfil-ui.js');
  });

  test('nenhuma página depende mais de foto de pessoa hospedada fora (unsplash/flaticon)', () => {
    for (const arq of fs.readdirSync(path.join(RAIZ, 'src', 'Views'))) {
      const html = ler('src', 'Views', arq);
      expect({ arq, externo: /unsplash\.com|flaticon\.com/.test(html) }).toEqual({ arq, externo: false });
    }
    expect(ler('public', 'scripts', 'sidebar.js')).not.toMatch(/unsplash/);
  });

  test('o perfil-ui limpa a foto guardada quando a sessão acaba e troca o token nas chamadas em andamento', () => {
    const js = ler('public', 'scripts', 'perfil-ui.js');
    expect(js).toMatch(/apagarLS\(CHAVE\)/);
    expect(js).toMatch(/\/api\/usuarios\/renovar/);
    expect(js).toMatch(/Bearer ' \+ atual/);
  });

  test('a barra mobile tem botão central, cápsula ativa, folha "Mais" e respeita a área segura do aparelho', () => {
    const css = ler('public', 'css', 'nav-mobile.css');
    for (const trecho of ['.nl-fab', 'env(safe-area-inset-bottom)', '.nl-mais-folha', '.nl-mais-perfil', 'backdrop-filter', '@media (max-width: 768px)']) {
      expect(css).toContain(trecho);
    }
    expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    const js = ler('public', 'scripts', 'nav-mobile.js');
    expect(js).toContain("BOTAO_CENTRAL = '/rotulos'");
    for (const v of ['home', 'dashboard', 'minhas-fichas', 'rotulos', 'diario', 'cardapio']) {
      expect(ler('src', 'Views', `${v}.html`)).toContain('/css/nav-mobile.css');
    }
    expect(ler('public', 'scripts', 'sidebar.js')).toContain('/css/nav-mobile.css');
  });
});
