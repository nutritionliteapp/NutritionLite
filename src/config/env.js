/**
 * Valida variáveis de ambiente obrigatórias no boot.
 * Nunca registra ou retorna valores das variáveis.
 */

const REQUIRED_VARS = [
  'JWT_SECRET',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SERVER',
  'DB_NAME',
];

/** Comprimento mínimo absoluto (falha no boot). */
const JWT_SECRET_MIN_LENGTH = 16;
/** Comprimento recomendado (apenas aviso). */
const JWT_SECRET_RECOMMENDED_LENGTH = 32;

/**
 * @param {{ exitOnError?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateEnv(options = {}) {
  const { exitOnError = true } = options;
  const errors = [];
  const warnings = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (value === undefined || String(value).trim() === '') {
      errors.push(`Variável obrigatória ausente: ${name}`);
    }
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    const len = String(jwtSecret).trim().length;
    if (len < JWT_SECRET_MIN_LENGTH) {
      errors.push(
        `JWT_SECRET deve ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres`
      );
    } else if (len < JWT_SECRET_RECOMMENDED_LENGTH) {
      warnings.push(
        `JWT_SECRET tem menos de ${JWT_SECRET_RECOMMENDED_LENGTH} caracteres; recomenda-se reforçar`
      );
    }
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(
      ['Avisos de configuração:', ...warnings.map((w) => `  - ${w}`)].join('\n')
    );
  }

  if (errors.length > 0) {
    const message = [
      'Configuração inválida. Corrija as variáveis de ambiente:',
      ...errors.map((e) => `  - ${e}`),
    ].join('\n');

    if (exitOnError && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.error(message);
      process.exit(1);
    }

    return { ok: false, errors, warnings };
  }

  return { ok: true, errors: [], warnings };
}

module.exports = {
  validateEnv,
  REQUIRED_VARS,
  JWT_SECRET_MIN_LENGTH,
  JWT_SECRET_RECOMMENDED_LENGTH,
};
