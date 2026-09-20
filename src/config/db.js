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

/**
 * Pool único, criado sob demanda e reaproveitado. Em falha de conexão a
 * promise rejeita sem encerrar o processo e a próxima chamada tenta de novo
 * (ex.: Azure SQL serverless "acordando"), permitindo health check e
 * tratamento pela aplicação.
 */
function obterPool() {
  if (!poolAtual) {
    const pool = new sql.ConnectionPool(config);
    // Sem listener, um 'error' do pool derrubaria o processo.
    pool.on('error', (err) => {
      logger.error(`Erro no pool do banco de dados: ${err.message}`);
    });

    const tentativa = pool
      .connect()
      .then((conectado) => {
        logger.info('Conectado ao Azure SQL');
        return conectado;
      })
      .catch((err) => {
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
