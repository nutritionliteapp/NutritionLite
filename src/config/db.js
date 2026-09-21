const sql = require('mssql');
require('dotenv').config();
const logger = require('../utils/logger');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolAtual = null;

function numeroDoAmbiente(nome, padrao) {
  const n = parseInt(process.env[nome], 10);
  return Number.isInteger(n) && n >= 0 ? n : padrao;
}

/**
 * Azure SQL serverless pausa quando fica ocioso: a primeira conexão depois disso falha
 * ("Can not connect to the database in its current state" ou timeout de 15 s) enquanto o banco
 * acorda, o que leva de 20 a 60 s. Em vez de falhar todas as requisições nesse intervalo,
 * tentamos de novo por até DB_RETRY_WINDOW_MS (padrão 60 s; 0 nos testes).
 */
const JANELA_TENTATIVAS_MS = numeroDoAmbiente('DB_RETRY_WINDOW_MS', process.env.NODE_ENV === 'test' ? 0 : 60000);
const ESPERA_ENTRE_TENTATIVAS_MS = numeroDoAmbiente('DB_RETRY_WAIT_MS', 5000);

const NUMEROS_TRANSITORIOS = new Set([40613, 40197, 40501, 49918, 49919, 49920]);
const PADRAO_TRANSITORIO =
  /current state|not currently available|failed to connect .* in \d+ms|ETIMEOUT|ETIMEDOUT|ESOCKET|ECONNRESET|ECONNREFUSED/i;

/** Falha que costuma passar sozinha (banco acordando, rede instável). Login inválido, por exemplo, não é. */
function erroTransitorio(err) {
  const numero = err && (err.number || (err.originalError && err.originalError.number));
  if (numero && NUMEROS_TRANSITORIOS.has(Number(numero))) return true;
  return PADRAO_TRANSITORIO.test(`${(err && err.code) || ''} ${(err && err.message) || ''}`);
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function conectarComTentativas() {
  const limite = Date.now() + JANELA_TENTATIVAS_MS;

  for (let tentativa = 1; ; tentativa++) {
    const pool = new sql.ConnectionPool(config);
    // Sem listener, um 'error' do pool derrubaria o processo.
    pool.on('error', (err) => {
      logger.error(`Erro no pool do banco de dados: ${err.message}`);
    });

    try {
      const conectado = await pool.connect();
      logger.info(tentativa > 1 ? `Conectado ao Azure SQL (tentativa ${tentativa})` : 'Conectado ao Azure SQL');
      return conectado;
    } catch (err) {
      const podeTentarDeNovo = erroTransitorio(err) && Date.now() + ESPERA_ENTRE_TENTATIVAS_MS < limite;
      if (!podeTentarDeNovo) throw err;

      logger.warn(
        `Banco indisponível (tentativa ${tentativa}); nova tentativa em ${Math.round(ESPERA_ENTRE_TENTATIVAS_MS / 1000)}s: ${err.message}`
      );
      if (typeof pool.close === 'function') await Promise.resolve(pool.close()).catch(() => {});
      await esperar(ESPERA_ENTRE_TENTATIVAS_MS);
    }
  }
}

/**
 * Pool único, criado sob demanda e reaproveitado. Se todas as tentativas falharem, a
 * promise rejeita sem encerrar o processo e a próxima chamada começa de novo, permitindo
 * health check e tratamento pela aplicação.
 */
function obterPool() {
  if (!poolAtual) {
    const tentativa = conectarComTentativas().catch((err) => {
      logger.error(`Erro ao conectar ao banco de dados: ${err.message}`);
      if (poolAtual === tentativa) poolAtual = null;
      throw err;
    });

    poolAtual = tentativa;
  }
  return poolAtual;
}

/**
 * Compatível com `await poolPromise` / `.then` usados nos controllers.
 */
const poolPromise = {
  then: (onFulfilled, onRejected) => obterPool().then(onFulfilled, onRejected),
  catch: (onRejected) => obterPool().catch(onRejected),
  finally: (onFinally) => obterPool().finally(onFinally),
};

// Conecta já no boot; a rejeição é tratada em obterPool (não derruba o processo).
obterPool().catch(() => {});

module.exports = {
  sql,
  poolPromise,
};
