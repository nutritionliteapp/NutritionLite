const express = require('express');
const router = express.Router();
const { conversarComIA } = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddlewares');
const { poolConnect, sql } = require('../config/db');

/**
 * @swagger
 * /chat/:
 *   post:
 *     summary: Envia mensagem para a IA nutricional
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Resposta da IA
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resposta:
 *                   type: string
 *                   example: Para perder peso, foco em déficit calórico e proteínas adequadas.
 *       400:
 *         description: Mensagem não enviada
 *       500:
 *         description: Erro interno do servidor
 */
router.post("/", authMiddleware, conversarComIA);


router.patch('/favoritar/:id', authMiddleware, async (req, res) => {
  try {
    const pool = await poolConnect;

    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE chatHistorico SET favorita = 1 WHERE id = @id');

    res.status(200).json({ mensagem: 'Recomendação favoritada!' });
  } catch (error) {
    console.error('Erro ao favoritar recomendação:', error);
    res.status(500).json({ mensagem: 'Erro ao favoritar.' });
  }
});

module.exports = router;
 