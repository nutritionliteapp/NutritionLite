const express = require('express');
const router = express.Router();
const { poolConnect, pool } = require('../config/db');

/**
 * @swagger
 * tags:
 *   name: Teste Conexão
 *   description: Testa se a conexão com o banco de dados está funcionando
 */

/**
 * @swagger
 * /teste/conexao:
 *   get:
 *     summary: Testa a conexão com o banco de dados
 *     tags: [Teste Conexão]
 *     responses:
 *       200:
 *         description: Conexão com o banco funcionando
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensagem:
 *                   type: string
 *                   example: Conexão com o banco de dados funcionando!
 *                 dataHoraServidor:
 *                   type: string
 *                   example: 2025-09-21T18:30:00Z
 *       500:
 *         description: Erro ao conectar no banco
 */
router.get('/conexao', async (req, res) => {
  try {
    await poolConnect;
    const result = await pool.request().query('SELECT GETDATE() AS dataHora');
    res.json({
      mensagem: 'Conexão com o banco de dados funcionando!',
      dataHoraServidor: result.recordset[0].dataHora
    });
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    res.status(500).json({ erro: 'Erro ao testar conexão com o banco de dados.' });
  }
});

module.exports = router;
