// src/utils/emailService.js
const nodemailer = require("nodemailer");
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: process.env.EMAIL_SECURE === 'true' || false, // true para 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false
  }
});

async function enviarEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"NutritionLite" <no-reply@nutritionlite.com>`,
      to,
      subject,
      html
    });
    console.log("✅ Email enviado:", info.messageId || info);
    return info;
  } catch (err) {
    console.error("❌ Erro ao enviar email:", err);
    throw err;
  }
}

async function enviarEmailConfirmacao(email, nome, token) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
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
