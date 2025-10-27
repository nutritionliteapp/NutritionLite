const Sentry = require('@sentry/node');

function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn("⚠️ Sentry DSN não configurado. Monitoramento desativado.");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || "development",
  });

  console.log("✅ Sentry inicializado com sucesso!");
}

module.exports = { initSentry, Sentry };
