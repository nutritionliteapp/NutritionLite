// src/utils/emailService.js
const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('./logger');
const { renderEmail, escapeHtml } = require('./emailTemplate');
require('dotenv').config();

function criarTransporter() {
  // Prioridade: URL SMTP única (mais fácil em hosts como Render)
  // Ex.: SMTP_URL="smtps://user:pass@smtp.gmail.com:465"
  if (process.env.SMTP_URL) {
    return nodemailer.createTransport(process.env.SMTP_URL);
  }

  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT || "587", 10);
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    // Deixa explícito o motivo para facilitar debug em produção
    throw new Error('Config de e-mail ausente: defina EMAIL_USER e EMAIL_PASS (ou SMTP_URL).');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Alguns provedores/hosts podem falhar com validação TLS estrita por cadeia incompleta.
    // Mantemos estrito por padrão; se necessário, o usuário pode configurar EMAIL_TLS_REJECT_UNAUTHORIZED=false.
    tls: {
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED === 'false' ? false : true,
    },
  });
}

let transporter;
try {
  transporter = criarTransporter();
} catch (err) {
  // Não derruba a aplicação no boot; cadastro continuará funcionando e o erro aparecerá no envio.
  logger.error(`Email transporter não inicializado: ${err.message || err}`);
  transporter = null;
}

/**
 * Provedores por API HTTPS (porta 443). Hospedagens como o Render (planos gratuitos) BLOQUEIAM as portas de
 * SMTP (25/465/587), então o Gmail nunca conecta lá; a API passa normalmente.
 *   BREVO_API_KEY  (brevo.com, 300 e-mails/dia grátis, basta verificar um remetente)
 *   RESEND_API_KEY (resend.com, exige domínio próprio verificado para enviar a terceiros)
 * Se nenhuma estiver configurada, usa SMTP como antes.
 */
function provedorApi() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

/** '"Nome" <a@b.com>' ou 'a@b.com' → { nome, email } */
function separarRemetente(bruto) {
  const texto = String(bruto || '').trim();
  const m = texto.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (m) return { nome: m[1].trim() || 'NutritionLite', email: m[2].trim() };
  return { nome: 'NutritionLite', email: texto };
}

function remetente() {
  return separarRemetente(
    process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || 'no-reply@nutritionlite.com'
  );
}

async function enviarPorApi(provedor, { to, subject, html, text }) {
  const de = remetente();
  const opcoes = { timeout: 15000 };

  if (provedor === 'brevo') {
    const r = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: de.nome, email: process.env.BREVO_SENDER_EMAIL || de.email },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(text ? { textContent: text } : {}),
      },
      { ...opcoes, headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    return { messageId: (r.data && r.data.messageId) || 'brevo' };
  }

  const r = await axios.post(
    'https://api.resend.com/emails',
    { from: `${de.nome} <${de.email}>`, to: [to], subject, html, ...(text ? { text } : {}) },
    { ...opcoes, headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return { messageId: (r.data && r.data.id) || 'resend' };
}

/** Mensagem útil para o log: a resposta do provedor diz o motivo (remetente não verificado, chave errada…). */
function descreverErro(err) {
  const resp = err && err.response;
  if (resp) return `HTTP ${resp.status} ${JSON.stringify(resp.data).slice(0, 300)}`;
  const dica = /ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNECTION/.test(String(err && (err.code || err.message)))
    ? ' — não conectou: se está no Render, as portas de SMTP são bloqueadas; use BREVO_API_KEY (API HTTPS)'
    : '';
  return `${err && err.message ? err.message : err}${dica}`;
}

async function enviarEmail(to, subject, html, text) {
  const provedor = provedorApi();
  if (provedor) {
    try {
      const info = await enviarPorApi(provedor, { to, subject, html, text });
      logger.info(`Email enviado (${provedor}): ${info.messageId}`);
      return info;
    } catch (err) {
      logger.error(`Erro ao enviar email (${provedor}): ${descreverErro(err)}`);
      throw err;
    }
  }

  try {
    if (!transporter) {
      // Tenta criar de novo em runtime (caso variáveis tenham sido configuradas após boot)
      transporter = criarTransporter();
    }

    const from =
      process.env.EMAIL_FROM ||
      process.env.EMAIL_USER ||
      `"NutritionLite" <no-reply@nutritionlite.com>`;

    // Verifica conectividade/credenciais antes de enviar (ajuda a dar erro mais claro)
    if (typeof transporter.verify === 'function') {
      await transporter.verify();
    }

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      // versão em texto puro: melhora a entrega e serve a quem lê sem HTML
      ...(text ? { text } : {}),
    });
    logger.info(`Email enviado: ${info.messageId || 'ok'}`);
    return info;
  } catch (err) {
    logger.error(`Erro ao enviar email: ${descreverErro(err)}`);
    throw err;
  }
}

async function enviarEmailConfirmacao(email, nome, token) {
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
  const link = `${baseUrl.replace(/\/$/, '')}/api/usuarios/confirmar-email/${token}`;

  const { html, text } = renderEmail({
    titulo: `Olá${nome ? ' ' + nome : ''}!`,
    preheader: 'Confirme seu e-mail para ativar sua conta no NutritionLite.',
    paragrafos: [
      'Obrigado por se cadastrar no NutritionLite! 🎉',
      'Para ativar sua conta, confirme o seu e-mail no botão abaixo. Este link expira em 1 hora.',
    ],
    botao: { texto: 'Confirmar meu e-mail', url: link },
    rodape: 'Se você não solicitou este e-mail, simplesmente ignore.',
  });

  return enviarEmail(email, 'Confirme seu e-mail - NutritionLite', html, text);
}

module.exports = { enviarEmail, enviarEmailConfirmacao, escapeHtml, separarRemetente, provedorApi };
