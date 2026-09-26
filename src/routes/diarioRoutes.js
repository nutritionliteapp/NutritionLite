const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const { limiteRotulos } = require('../middlewares/rateLimiter');
const { limiteIAUsuario } = require('../middlewares/limiteIA');
const c = require('../controllers/diarioController');

/**
 * @swagger
 * /api/diario:
 *   get:
 *     summary: Diário alimentar de um dia (itens, totais, metas estimadas e progresso)
 *     tags: [Diário]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: data
 *         schema: { type: string, example: "2026-09-26" }
 *     responses:
 *       200: { description: Resumo do dia }
 *       503: { description: Migration 005 ainda não aplicada }
 *   post:
 *     summary: Registra uma refeição (macros recalculados a partir da TACO)
 *     tags: [Diário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { description: Refeição registrada }
 */
router.get('/', authMiddleware, c.obterDia);
router.post('/', authMiddleware, c.registrar);

router.get('/semana', authMiddleware, c.obterSemana);
router.get('/dica', authMiddleware, c.obterDica);
router.get('/alimentos', authMiddleware, c.buscarAlimentos);

/** Foto da refeição -> alimentos + macros estimados (IA de visão). */
router.post('/analisar-foto', authMiddleware, limiteRotulos, limiteIAUsuario('foto'), c.analisarFoto);

router.delete('/:id', authMiddleware, c.remover);

module.exports = router;
