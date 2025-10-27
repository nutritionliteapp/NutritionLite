const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  console.error("🔥 Erro capturado:", err);

  // Log no arquivo
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);

  // Envia pro Sentry se estiver ativo
  if (Sentry.getCurrentHub().getClient()) {
    Sentry.captureException(err);
  }

  const status = err.status || 500;
  const mensagem = err.mensagem || 'Erro interno do servidor.';

  res.status(status).json({
    sucesso: false,
    mensagem,
    detalhes: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

module.exports = errorHandler;
