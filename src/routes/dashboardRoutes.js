const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const { obterResumo } = require('../controllers/dashboardController');

/**
 * @swagger
 * /api/dashboard/resumo:
 *   get:
 *     summary: Indicadores do dashboard do usuário (fichas, macros, IMC, meta de proteína…)
 *     description: Calculado a partir das fichas alimentares e do perfil do usuário logado.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumo com evolução das fichas, distribuição de macros, IMC, médias e alimentos mais usados
 *       401:
 *         description: Não autenticado
 */
router.get('/resumo', authMiddleware, obterResumo);

module.exports = router;
