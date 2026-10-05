/**
 * Entrar com Google / Facebook (OAuth 2.0, fluxo "authorization code").
 *
 *   GET /api/auth/social/:provedor            → manda a pessoa para o provedor
 *   GET /api/auth/social/:provedor/callback   → o provedor devolve ?code; aqui vira a sessão do NutritionLite
 *
 * Sem biblioteca extra: são duas chamadas HTTPS por provedor. A sessão volta ao navegador no fragmento
 * da URL (/login#token=…), que nunca vai para logs nem para o cabeçalho Referer. Quem barra falsificação
 * de pedido (CSRF) é o parâmetro `state`, comparado com um cookie httpOnly de vida curta.
 *
 * Contas: o e-mail do provedor é a chave. Se já existe conta com esse e-mail, entra nela; senão cria uma
 * já confirmada (o provedor garantiu o e-mail). Conta antiga NÃO confirmada é "limpa" ao ser assumida:
 * a senha é trocada por uma aleatória, para que quem cadastrou o e-mail alheio sem confirmar não
 * continue com acesso.
 */
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const { normalizeEmail } = require('../utils/security');

const COOKIE_STATE = 'nl_oauth_state';
const VALIDADE_STATE_MS = 10 * 60 * 1000;
const TIMEOUT_HTTP_MS = 10 * 1000;
const FB_VERSAO = 'v19.0';

const PROVEDORES = Object.freeze({
  google: {
    nome: 'Google',
    idVar: 'GOOGLE_CLIENT_ID',
    segredoVar: 'GOOGLE_CLIENT_SECRET',
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    escopo: 'openid email profile',
  },
  facebook: {
    nome: 'Facebook',
    idVar: 'FACEBOOK_APP_ID',
    segredoVar: 'FACEBOOK_APP_SECRET',
    autorizar: `https://www.facebook.com/${FB_VERSAO}/dialog/oauth`,
    escopo: 'email,public_profile',
  },
});

const credenciais = (p) => ({
  id: String(process.env[PROVEDORES[p].idVar] || '').trim(),
  segredo: String(process.env[PROVEDORES[p].segredoVar] || '').trim(),
});

const configurado = (p) => {
  const c = credenciais(p);
  return Boolean(c.id && c.segredo);
};

const erroNaTela = (res, codigo) => res.redirect(`/login?erro=${codigo}`);

/** Endereço de volta, idêntico ao cadastrado no painel do provedor (PUBLIC_URL tem prioridade). */
function urlDeRetorno(req, provedor) {
  const publica = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const base = /^https?:\/\/[^\s/]+$/i.test(publica) ? publica : `${req.protocol}://${req.get('host')}`;
  return `${base}/api/auth/social/${provedor}/callback`;
}

function lerCookie(req, nome) {
  const bruto = String((req.headers && req.headers.cookie) || '');
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return '';
}

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

const opcoesCookie = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth/social',
});

/** 1) Leva a pessoa para a tela de consentimento do provedor. */
const iniciar = (req, res) => {
  const provedor = req.params.provedor;
  if (!Object.hasOwn(PROVEDORES, provedor)) return erroNaTela(res, 'social_desconhecido');
  if (!configurado(provedor)) return erroNaTela(res, 'social_indisponivel');

  const state = crypto.randomBytes(24).toString('base64url');
  res.cookie(COOKIE_STATE, state, { ...opcoesCookie(), maxAge: VALIDADE_STATE_MS });
  res.set('Cache-Control', 'no-store');

  const cfg = PROVEDORES[provedor];
  const consulta = new URLSearchParams({
    client_id: credenciais(provedor).id,
    redirect_uri: urlDeRetorno(req, provedor),
    response_type: 'code',
    scope: cfg.escopo,
    state,
  });
  if (provedor === 'google') consulta.set('prompt', 'select_account');
  return res.redirect(`${cfg.autorizar}?${consulta.toString()}`);
};

/** Troca o código pelo perfil do provedor: { email, nome, verificado }. */
async function buscarPerfil(provedor, code, redirectUri) {
  const { id, segredo } = credenciais(provedor);
  const http = { timeout: TIMEOUT_HTTP_MS };

  if (provedor === 'google') {
    const t = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({ code, client_id: id, client_secret: segredo, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
      { ...http, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const u = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      ...http,
      headers: { Authorization: `Bearer ${t.data.access_token}` },
    });
    return { email: u.data.email, nome: u.data.name, verificado: u.data.email_verified === true };
  }

  const t = await axios.get(`https://graph.facebook.com/${FB_VERSAO}/oauth/access_token`, {
    ...http,
    params: { client_id: id, client_secret: segredo, redirect_uri: redirectUri, code },
  });
  const u = await axios.get('https://graph.facebook.com/me', {
    ...http,
    params: { fields: 'id,name,email', access_token: t.data.access_token },
  });
  // O Facebook só devolve e-mail confirmado por ele; sem e-mail (permissão negada) não há como criar a conta.
  return { email: u.data.email, nome: u.data.name, verificado: Boolean(u.data.email) };
}

/** Acha a conta pelo e-mail ou cria uma já confirmada. Retorna { id, email }. */
async function contaDoEmail(email, nome) {
  const pool = await poolPromise;
  const achada = await pool
    .request()
    .input('email', sql.VarChar, email)
    .query('SELECT id, email, email_confirmado FROM usuarios WHERE email = @email');
  const existente = achada.recordset[0];
  const senhaInutilizavel = async () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  if (existente) {
    if (existente.email_confirmado !== 1 && existente.email_confirmado !== true) {
      await pool
        .request()
        .input('id', sql.Int, existente.id)
        .input('senha', sql.VarChar, await senhaInutilizavel())
        .query(`
          UPDATE usuarios
             SET email_confirmado = 1, token_confirmacao = NULL, token_expira = NULL,
                 senha_hash = @senha, ultima_atualizacao = GETDATE()
           WHERE id = @id
        `);
    }
    return { id: existente.id, email: existente.email };
  }

  const nomeFinal = String(nome || email.split('@')[0]).trim().slice(0, 120) || 'Usuário';
  const criada = await pool
    .request()
    .input('nome', sql.VarChar, nomeFinal)
    .input('email', sql.VarChar, email)
    .input('senha', sql.VarChar, await senhaInutilizavel())
    .query(`
      INSERT INTO usuarios (nome, email, senha_hash, data_cadastro, ultima_atualizacao, email_confirmado)
      OUTPUT INSERTED.id
      VALUES (@nome, @email, @senha, GETDATE(), GETDATE(), 1)
    `);
  return { id: criada.recordset[0].id, email };
}

/** 2) O provedor devolve a pessoa aqui com ?code&state. */
const retorno = async (req, res) => {
  const provedor = req.params.provedor;
  if (!Object.hasOwn(PROVEDORES, provedor)) return erroNaTela(res, 'social_desconhecido');
  if (!configurado(provedor)) return erroNaTela(res, 'social_indisponivel');

  const esperado = lerCookie(req, COOKIE_STATE);
  res.clearCookie(COOKIE_STATE, opcoesCookie());
  res.set('Cache-Control', 'no-store');

  if (req.query.error) return erroNaTela(res, 'social_cancelado');
  const { code, state } = req.query;
  if (typeof code !== 'string' || typeof state !== 'string' || !iguais(state, esperado)) {
    return erroNaTela(res, 'social_estado');
  }

  try {
    const perfil = await buscarPerfil(provedor, code, urlDeRetorno(req, provedor));
    const email = normalizeEmail(perfil.email);
    if (!email) return erroNaTela(res, 'social_sem_email');
    if (!perfil.verificado) return erroNaTela(res, 'social_email_nao_verificado');

    const conta = await contaDoEmail(email, perfil.nome);
    const token = jwt.sign({ id: conta.id, email: conta.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.redirect(`/login#token=${encodeURIComponent(token)}`);
  } catch (error) {
    logger.error(`Login social (${provedor}): ${error.message}`);
    return erroNaTela(res, 'social_falhou');
  }
};

module.exports = { iniciar, retorno, PROVEDORES };
