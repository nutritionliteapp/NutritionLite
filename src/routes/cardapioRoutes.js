const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const { limiteRotulos } = require('../middlewares/rateLimiter');
const { limiteIAUsuario } = require('../middlewares/limiteIA');
const { gerar, ultimo } = require('../controllers/cardapioController');

/**
 * @swagger
 * /api/cardapio/gerar:
 *   post:
 *     summary: Gera um cardápio semanal dentro de um orçamento (IA + TACO), com lista de compras
 *     tags: [Cardápio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Cardápio com custo e macros calculados no servidor }
 */
router.post('/gerar', authMiddleware, limiteRotulos, limiteIAUsuario('cardapio'), gerar);
router.get('/ultimo', authMiddleware, ultimo);

module.exports = router;
