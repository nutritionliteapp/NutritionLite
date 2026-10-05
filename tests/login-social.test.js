/** Entrar com Google / Facebook: redirecionamento, state (CSRF), criação/vínculo de conta e erros. */
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = 'https://nutritionlite.exemplo.com';

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/middlewares/rateLimiter', () => ({
  ...jest.requireActual('../src/middlewares/rateLimiter'),
  limiteGeral: (req, res, next) => next(),
  limiteLogin: (req, res, next) => next(),
}));
jest.mock('axios');
const axios = require('axios');

let mockManipulador = () => ({ recordset: [], rowsAffected: [0] });
const mockConsultas = [];
jest.mock('../src/config/db', () => {
  class Request {
    constructor() { this.inputs = {}; }
    input(k, _t, v) { this.inputs[k] = v; return this; }
    async query(q) {
      mockConsultas.push({ q, inputs: { ...this.inputs } });
      return mockManipulador(q, this.inputs);
    }
  }
  return {
    sql: { Int: 'Int', VarChar: 'VarChar' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const app = require('../src/app');

function chaves() {
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  process.env.FACEBOOK_APP_ID = 'fid';
  process.env.FACEBOOK_APP_SECRET = 'fsecret';
}

/** Faz o passo 1 e devolve { state, cookie } como o navegador guardaria. */
async function iniciar(provedor) {
  const r = await request(app).get(`/api/auth/social/${provedor}`);
  const url = new URL(r.headers.location);
  return { r, url, state: url.searchParams.get('state'), cookie: r.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ') };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockConsultas.length = 0;
  chaves();
  mockManipulador = () => ({ recordset: [], rowsAffected: [0] });
});

describe('passo 1: GET /api/auth/social/:provedor', () => {
  it('Google: redireciona com client_id, redirect_uri da PUBLIC_URL, escopo e state', async () => {
    const { r, url, state } = await iniciar('google');
    expect(r.status).toBe(302);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('gid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://nutritionlite.exemplo.com/api/auth/social/google/callback');
    expect(url.searchParams.get('scope')).toContain('email');
    expect(state.length).toBeGreaterThanOrEqual(24);
  });

  it('Facebook: redireciona para o diálogo do Facebook pedindo e-mail', async () => {
    const { r, url } = await iniciar('facebook');
    expect(r.status).toBe(302);
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.searchParams.get('scope')).toContain('email');
  });

  it('o cookie do state é httpOnly e SameSite=Lax', async () => {
    const { r } = await iniciar('google');
    const c = r.headers['set-cookie'][0];
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
  });

  it('sem as chaves configuradas volta ao login com aviso (nada é enviado ao provedor)', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const r = await request(app).get('/api/auth/social/google');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/login?erro=social_indisponivel');
  });

  it('provedor desconhecido (github, etc.) não existe', async () => {
    const r = await request(app).get('/api/auth/social/github');
    expect(r.headers.location).toBe('/login?erro=social_desconhecido');
  });
});

describe('passo 2: GET /api/auth/social/:provedor/callback', () => {
  const google = (extra = {}) => {
    axios.post.mockResolvedValue({ data: { access_token: 'at' } });
    axios.get.mockResolvedValue({ data: { email: 'Ana@Exemplo.com', name: 'Ana', email_verified: true, ...extra } });
  };
  const voltar = async (provedor, cookie, state) =>
    request(app).get(`/api/auth/social/${provedor}/callback?code=abc&state=${state}`).set('Cookie', cookie);

  it('state que não bate com o cookie é recusado (CSRF) sem falar com o provedor', async () => {
    const { cookie } = await iniciar('google');
    const r = await voltar('google', cookie, 'forjado');
    expect(r.headers.location).toBe('/login?erro=social_estado');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('sem cookie de state é recusado', async () => {
    const r = await request(app).get('/api/auth/social/google/callback?code=abc&state=qualquer');
    expect(r.headers.location).toBe('/login?erro=social_estado');
  });

  it('pessoa que cancelou no provedor volta com mensagem amigável', async () => {
    const { cookie } = await iniciar('google');
    const r = await request(app).get('/api/auth/social/google/callback?error=access_denied').set('Cookie', cookie);
    expect(r.headers.location).toBe('/login?erro=social_cancelado');
  });

  it('conta nova: cria já confirmada e devolve JWT no fragmento da URL', async () => {
    google();
    mockManipulador = (q) => (q.includes('SELECT id') ? { recordset: [] } : { recordset: [{ id: 42 }] });
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);

    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/^\/login#token=/);
    const token = decodeURIComponent(r.headers.location.split('#token=')[1]);
    expect(jwt.verify(token, process.env.JWT_SECRET)).toMatchObject({ id: 42, email: 'ana@exemplo.com' });

    const insert = mockConsultas.find((c) => c.q.includes('INSERT INTO usuarios'));
    expect(insert.q).toMatch(/email_confirmado\)[\s\S]*VALUES[\s\S]*1\)/);
    expect(insert.inputs.email).toBe('ana@exemplo.com'); // normalizado
    expect(insert.inputs.senha).toMatch(/^\$2[aby]\$/); // senha aleatória inutilizável (hash bcrypt)
  });

  it('conta já confirmada: só entra, sem alterar nada', async () => {
    google();
    mockManipulador = () => ({ recordset: [{ id: 7, email: 'ana@exemplo.com', email_confirmado: true }] });
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);
    expect(r.headers.location).toMatch(/^\/login#token=/);
    expect(mockConsultas.some((c) => /UPDATE|INSERT/.test(c.q))).toBe(false);
  });

  it('conta antiga NÃO confirmada: é assumida e a senha antiga deixa de valer', async () => {
    google();
    mockManipulador = () => ({ recordset: [{ id: 9, email: 'ana@exemplo.com', email_confirmado: false }] });
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);
    expect(r.headers.location).toMatch(/^\/login#token=/);
    const upd = mockConsultas.find((c) => c.q.includes('UPDATE usuarios'));
    expect(upd.q).toContain('email_confirmado = 1');
    expect(upd.q).toContain('senha_hash = @senha');
    expect(upd.q).toContain('token_confirmacao = NULL');
  });

  it('Google com e-mail não verificado é recusado', async () => {
    google({ email_verified: false });
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);
    expect(r.headers.location).toBe('/login?erro=social_email_nao_verificado');
    expect(mockConsultas.length).toBe(0);
  });

  it('Facebook sem e-mail (permissão negada) é recusado', async () => {
    axios.get.mockResolvedValueOnce({ data: { access_token: 'at' } }).mockResolvedValueOnce({ data: { id: '1', name: 'Bia' } });
    const { state, cookie } = await iniciar('facebook');
    const r = await voltar('facebook', cookie, state);
    expect(r.headers.location).toBe('/login?erro=social_sem_email');
  });

  it('Facebook com e-mail entra normalmente', async () => {
    axios.get.mockResolvedValueOnce({ data: { access_token: 'at' } }).mockResolvedValueOnce({ data: { id: '1', name: 'Bia', email: 'bia@x.com' } });
    mockManipulador = () => ({ recordset: [{ id: 3, email: 'bia@x.com', email_confirmado: 1 }] });
    const { state, cookie } = await iniciar('facebook');
    const r = await voltar('facebook', cookie, state);
    expect(r.headers.location).toMatch(/^\/login#token=/);
  });

  it('falha de rede com o provedor vira mensagem, sem vazar detalhes', async () => {
    axios.post.mockRejectedValue(new Error('ECONNRESET segredo-interno'));
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);
    expect(r.headers.location).toBe('/login?erro=social_falhou');
  });

  it('o state é de uso único: o cookie é apagado depois do retorno', async () => {
    google();
    const { state, cookie } = await iniciar('google');
    const r = await voltar('google', cookie, state);
    expect(r.headers['set-cookie'].join(';')).toMatch(/nl_oauth_state=;/);
  });
});

describe('tela de login', () => {
  it('só Google e Facebook, apontando para a API', async () => {
    const r = await request(app).get('/login');
    expect(r.text).toContain('/api/auth/social/google');
    expect(r.text).toContain('/api/auth/social/facebook');
    expect(r.text).not.toMatch(/bxl-github|bxl-linkedin/);
    expect(r.text).toContain('/scripts/login-social.js');
  });
});
