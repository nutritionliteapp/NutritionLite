process.env.NODE_ENV = 'test';
// janela curta só para o teste (nos testes o padrão é 0 = sem tentativas)
process.env.DB_RETRY_WINDOW_MS = '2000';
process.env.DB_RETRY_WAIT_MS = '10';

const mockConnect = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: mockConnect,
    close: mockClose,
  })),
}));

const erroBanco = (mensagem, extra = {}) => Object.assign(new Error(mensagem), extra);

async function carregarDb() {
  let modulo;
  jest.isolateModules(() => {
    modulo = require('../src/config/db');
  });
  return modulo;
}

beforeEach(() => {
  mockConnect.mockReset();
  mockClose.mockClear();
});

describe('config/db — tentativas enquanto o banco acorda (Azure SQL serverless)', () => {
  test('"current state" (banco pausado) é tentado de novo até conectar', async () => {
    const pool = { conectado: true };
    mockConnect
      .mockRejectedValueOnce(erroBanco('Can not connect to the database in its current state.'))
      .mockRejectedValueOnce(erroBanco('Can not connect to the database in its current state.'))
      .mockResolvedValue(pool);

    const { poolPromise } = await carregarDb();

    await expect(poolPromise).resolves.toBe(pool);
    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(mockClose).toHaveBeenCalledTimes(2); // libera o pool de cada tentativa falha
  });

  test('timeout de 15 s ("Failed to connect ... in 15000ms") também é tentado de novo', async () => {
    const pool = { conectado: true };
    mockConnect
      .mockRejectedValueOnce(erroBanco('Failed to connect to nutritionlite-server.database.windows.net:1433 in 15000ms'))
      .mockResolvedValue(pool);

    const { poolPromise } = await carregarDb();

    await expect(poolPromise).resolves.toBe(pool);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  test.each([40613, 40197, 40501])('erro %i do Azure (indisponível/reconfigurando) é transitório', async (numero) => {
    const pool = { conectado: true };
    mockConnect.mockRejectedValueOnce(erroBanco('Database unavailable', { number: numero })).mockResolvedValue(pool);

    const { poolPromise } = await carregarDb();

    await expect(poolPromise).resolves.toBe(pool);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  test('erro que não passa sozinho (login inválido) falha na hora, sem insistir', async () => {
    mockConnect.mockRejectedValue(erroBanco("Login failed for user 'x'.", { number: 18456 }));

    const { poolPromise } = await carregarDb();

    await expect(poolPromise).rejects.toThrow(/Login failed/);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  test('desiste depois da janela de tentativas e rejeita com o último erro', async () => {
    mockConnect.mockRejectedValue(erroBanco('Can not connect to the database in its current state.'));

    const { poolPromise } = await carregarDb();

    await expect(poolPromise).rejects.toThrow(/current state/);
    expect(mockConnect.mock.calls.length).toBeGreaterThan(1);
  });

  test('requisições simultâneas compartilham a mesma tentativa (não abrem várias conexões)', async () => {
    const pool = { conectado: true };
    mockConnect
      .mockRejectedValueOnce(erroBanco('Can not connect to the database in its current state.'))
      .mockResolvedValue(pool);

    const { poolPromise } = await carregarDb();
    const resultados = await Promise.all([poolPromise, poolPromise, poolPromise]);

    expect(resultados.every((r) => r === pool)).toBe(true);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
