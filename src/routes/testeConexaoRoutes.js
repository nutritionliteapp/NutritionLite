const express = require('express');
const router = express.Router();
const { poolPromise } = require('../config/db');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/teste/conexao:
 *   get:
 *     summary: Testa a conexão com o banco de dados (health check)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Conexão com o banco funcionando
 *       503:
 *         description: Banco indisponível
 */
router.get('/conexao', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT GETDATE() AS dataHora');
    return res.json({
      sucesso: true,
      mensagem: 'Conexão com o banco de dados funcionando!',
      dataHoraServidor: result.recordset[0].dataHora,
    });
  } catch (error) {
    logger.error(`Erro ao testar conexão: ${error.message}`);
    return res.status(503).json({
      sucesso: false,
      mensagem: 'Banco de dados indisponível.',
    });
  }
});

module.exports = router;
