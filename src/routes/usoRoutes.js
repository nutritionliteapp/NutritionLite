const express = require('express');
const router = express.Router();
const { statusUso } = require('../middlewares/limiteVisitante');

/**
 * @swagger
 * /api/uso/{recurso}:
 *   get:
 *     summary: Saldo de consultas gratuitas do visitante (chat ou taco), sem consumir
 *     description: Logado retorna ilimitado. Visitante retorna total, restantes e quando renova.
 *     tags: [Uso]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: recurso
 *         required: true
 *         schema:
 *           type: string
 *           enum: [chat, taco]
 *     responses:
 *       200:
 *         description: Saldo atual
 *       404:
 *         description: Recurso desconhecido
 */
router.get('/:recurso', statusUso);

module.exports = router;
