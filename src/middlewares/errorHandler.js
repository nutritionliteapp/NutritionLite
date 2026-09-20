const { isSentryActive, Sentry } = require('../config/sentry');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);

  if (isSentryActive()) {
    Sentry.captureException(err);
  }

  const status = err.status || err.statusCode || 500;
  const mensagem =
    err.mensagem || err.message || 'Erro interno do servidor.';

  const payload = {
    sucesso: false,
    mensagem:
      status === 500 && process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor.'
        : mensagem,
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    payload.detalhes = err.stack;
  }

  return res.status(status).json(payload);
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    sucesso: false,
    mensagem: 'Rota não encontrada.',
    caminho: req.originalUrl,
  });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
