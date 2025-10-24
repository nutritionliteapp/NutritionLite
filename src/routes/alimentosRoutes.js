const express = require('express');
const router = express.Router();
const alimentosController = require('../controllers/alimentosController');
const authMiddleware = require('../middlewares/authMiddlewares');

/**
 * @swagger
 * tags:
 *   name: Alimentos
 *   description: Rotas para listar e buscar alimentos
 */

/**
 * @swagger
 * /alimento/:
 *   get:
 *     summary: Lista todos os alimentos disponíveis
 *     tags: [Alimentos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de alimentos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   nome_alimento:
 *                     type: string
 *                     example: Arroz Integral
 *                   descricao:
 *                     type: string
 *                     example: Arroz integral cozido
 *                   kcal:
 *                     type: number
 *                     example: 110
 *                   proteina:
 *                     type: number
 *                     example: 2.6
 *                   carboidrato:
 *                     type: number
 *                     example: 23
 *                   gordura:
 *                     type: number
 *                     example: 0.9
 */
router.get('/', authMiddleware, alimentosController.listarAlimentos);

/**
 * @swagger
 * /alimento/buscar:
 *   get:
 *     summary: Busca alimentos por nome
 *     tags: [Alimentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: nome
 *         schema:
 *           type: string
 *         required: true
 *         description: Nome ou parte do nome do alimento a ser buscado
 *         example: arroz
 *     responses:
 *       200:
 *         description: Lista de alimentos encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   nome_alimento:
 *                     type: string
 *                     example: Arroz Integral
 *                   descricao:
 *                     type: string
 *                     example: Arroz integral cozido
 *                   kcal:
 *                     type: number
 *                     example: 110
 *                   proteina:
 *                     type: number
 *                     example: 2.6
 *                   carboidrato:
 *                     type: number
 *                     example: 23
 *                   gordura:
 *                     type: number
 *                     example: 0.9
 *       400:
 *         description: Parâmetro de busca inválido
 */
router.get('/buscar', authMiddleware, alimentosController.buscarAlimentosPorNome);

module.exports = router;
