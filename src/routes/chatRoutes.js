const express = require('express');
const router = express.Router();
const { conversarComIA } = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddlewares');
const { limiteChat } = require('../middlewares/rateLimiter');
const { limiteDiarioVisitante } = require('../middlewares/limiteVisitante');
const { poolPromise, sql } = require('../config/db');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Envia mensagem para a IA nutricional
 *     description: Logado (Bearer) não tem limite diário e a IA usa a própria ficha. Visitante (sem token) tem cota diária (padrão 5) e não grava histórico.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensagem:
 *                 type: string
 *                 example: Quero perder peso
 *               modo:
 *                 type: string
 *                 example: geral
 *     responses:
 *       200:
 *         description: Resposta da IA
 *       400:
 *         description: Mensagem não enviada
 *       429:
 *         description: Cota diária do visitante esgotada (limite_diario=true) ou limite de mensagens por período
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', limiteChat, limiteDiarioVisitante('chat'), conversarComIA);

/**
 * @swagger
 * /api/chat/favoritar/{id}:
 *   patch:
 *     summary: Favorita uma mensagem do histórico do usuário
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Favoritado
 *       404:
 *         description: Registro não encontrado
 */
router.patch('/favoritar/:id', authMiddleware, async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const usuarioId = req.usuario.id;
    const id = parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, usuarioId)
      .query(
        'UPDATE chatHistorico SET favorita = 1 WHERE id = @id AND usuario_id = @usuario_id'
      );

    if (!result.rowsAffected || result.rowsAffected[0] === 0) {
      return res.status(404).json({ mensagem: 'Registro não encontrado.' });
    }

    return res.status(200).json({ mensagem: 'Recomendação favoritada!' });
  } catch (error) {
    logger.error(`Erro ao favoritar recomendação: ${error.message}`);
    return next(error);
  }
});

module.exports = router;
