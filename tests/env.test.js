const {
  validateEnv,
  JWT_SECRET_MIN_LENGTH,
  JWT_SECRET_RECOMMENDED_LENGTH,
} = require('../src/config/env');

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setValidEnv() {
    process.env.JWT_SECRET = 'a'.repeat(JWT_SECRET_RECOMMENDED_LENGTH);
    process.env.DB_USER = 'user';
    process.env.DB_PASSWORD = 'pass';
    process.env.DB_SERVER = 'server.example';
    process.env.DB_NAME = 'db';
  }

  test('retorna ok quando todas as variáveis obrigatórias estão presentes', () => {
    setValidEnv();
    const result = validateEnv({ exitOnError: false });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('reporta variáveis ausentes sem incluir valores', () => {
    delete process.env.JWT_SECRET;
    delete process.env.DB_PASSWORD;
    process.env.DB_USER = 'user';
    process.env.DB_SERVER = 'server.example';
    process.env.DB_NAME = 'db';

    const result = validateEnv({ exitOnError: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
    expect(result.errors.some((e) => e.includes('DB_PASSWORD'))).toBe(true);
    // Nomes das variáveis podem aparecer; valores reais não.
    const joined = result.errors.join(' ');
    expect(joined).not.toContain('super-secreto-valor');
    expect(joined).not.toMatch(/=\s*\S+/);
  });

  test('rejeita JWT_SECRET abaixo do mínimo absoluto', () => {
    setValidEnv();
    process.env.JWT_SECRET = 'curto';
    const result = validateEnv({ exitOnError: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
  });

  test('avisa (sem falhar) quando JWT_SECRET está abaixo do recomendado', () => {
    setValidEnv();
    process.env.JWT_SECRET = 'b'.repeat(JWT_SECRET_MIN_LENGTH);
    const result = validateEnv({ exitOnError: false });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('JWT_SECRET'))).toBe(true);
  });
});
