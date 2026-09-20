const crypto = require('crypto');

/** Normaliza e-mail para busca/persistência. */
function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** Hash SHA-256 hex do token (não reverter). */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/** Gera token opaco + hash para armazenamento. */
function generateTokenPair() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

/**
 * Política de senha alinhada ao cadastro e ao reset.
 * @returns {{ ok: boolean, mensagem?: string }}
 */
function validatePasswordStrength(senha) {
  if (typeof senha !== 'string' || senha.length < 8) {
    return { ok: false, mensagem: 'A senha deve ter pelo menos 8 caracteres.' };
  }
  if (senha.length > 128) {
    return { ok: false, mensagem: 'A senha é demasiado longa.' };
  }
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    return {
      ok: false,
      mensagem: 'A senha deve conter letras e números.',
    };
  }
  return { ok: true };
}

module.exports = {
  normalizeEmail,
  hashToken,
  generateTokenPair,
  validatePasswordStrength,
};
