// src/utils/emailService.js
const nodemailer = require("nodemailer");
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
  console.error('❌ Email transporter não inicializado:', err.message || err);
  transporter = null;
}

async function enviarEmail(to, subject, html) {
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
      html
    });
    console.log("✅ Email enviado:", info.messageId || info);
    return info;
  } catch (err) {
    console.error("❌ Erro ao enviar email:", err && err.message ? err.message : err);
    throw err;
  }
}

async function enviarEmailConfirmacao(email, nome, token) {
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
  const link = `${baseUrl.replace(/\/$/, '')}/api/usuarios/confirmar-email/${token}`;
    const html = `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <h2>Olá${nome ? ' ' + nome : ''}!</h2>
      <p>Obrigado por se cadastrar no <strong>NutritionLite</strong>! 🎉</p>
      <p>Para ativar sua conta, clique no link abaixo:</p>
      <p><a href="${link}" target="_blank">Confirmar meu e-mail</a></p>
      <p>Se o link não abrir, copie e cole este endereço no navegador:</p>
      <p style="font-size: 13px; color: #555;">${link}</p>
      <p>Este link expira em 1 hora.</p>
      <hr />
      <small>Se você não solicitou este e-mail, simplesmente ignore.</small>
    </div>
  `;
  return enviarEmail(email, "Confirme seu e-mail - NutritionLite", html);
}

module.exports = { enviarEmail, enviarEmailConfirmacao };
