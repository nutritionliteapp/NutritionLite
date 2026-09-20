process.env.NODE_ENV = 'test';

const mockConnect = jest.fn();
const mockPoolOn = jest.fn();

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    on: mockPoolOn,
    connect: mockConnect,
  })),
}));

const aguardarMicrotarefas = () => new Promise((resolve) => setImmediate(resolve));

describe('config/db — conexão sob demanda', () => {
  test('falha inicial não derruba o processo e a próxima chamada reconecta', async () => {
    const pool = { conectado: true };
    mockConnect.mockRejectedValueOnce(new Error('banco indisponível'));
    mockConnect.mockResolvedValue(pool);

    // A conexão eager do boot rejeita; sem tratamento isso encerraria o processo.
    const { poolPromise } = require('../src/config/db');
    await aguardarMicrotarefas();
    expect(mockConnect).toHaveBeenCalledTimes(1);

    // Nova tentativa acontece no primeiro uso, sem precisar reiniciar a aplicação.
    await expect(poolPromise).resolves.toBe(pool);
    expect(mockConnect).toHaveBeenCalledTimes(2);

    // Com o pool conectado, ele é reaproveitado.
    await expect(poolPromise).resolves.toBe(pool);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  test('registra listener de erro no pool (evita crash por evento "error" sem tratador)', () => {
    expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
