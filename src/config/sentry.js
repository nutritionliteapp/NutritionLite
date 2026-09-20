const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

let initialized = false;

/**
 * Inicializa o Sentry (SDK v9). Sem DSN, permanece desativado.
 * Não registra o valor do DSN.
 */
function initSentry() {
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN não configurado. Monitoramento desativado.');
    return false;
  }

  if (initialized) {
    return true;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.NODE_ENV || 'development',
  });

  initialized = true;
  logger.info('Sentry inicializado com sucesso.');
  return true;
}

function isSentryActive() {
  return initialized;
}

module.exports = { initSentry, isSentryActive, Sentry };
