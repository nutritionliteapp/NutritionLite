const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const fichaController = require('../controllers/fichaController');
const authMiddleware = require('../middlewares/authMiddlewares');

/**
 * @swagger
 * tags:
 *   name: Ficha Alimentar
 *   description: Rotas para criação, listagem, exclusão e recomendação de dietas
 */

/**
 * @swagger
 * /ficha/refeicao:
 *   post:
 *     summary: Cria uma nova ficha alimentar para o usuário logado
 *     tags: [Ficha Alimentar]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               objetivo:
 *                 type: string
 *                 example: perder peso
 *               alimentos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     quantidade:
 *                       type: number
 *                       example: 100
 *     responses:
 *       201:
 *         description: Ficha criada com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post(
  '/refeicao',
  authMiddleware,
  [
    body('objetivo')
      .isString().withMessage('O objetivo deve ser um texto válido.')
      .isLength({ min: 3 }).withMessage('O objetivo deve ter pelo menos 3 caracteres.'),
    body('alimentos')
      .isArray({ min: 1 }).withMessage('A lista de alimentos deve conter ao menos 1 item.'),
  ],
  fichaController.criarFicha
);

/**
 * @swagger
 * /ficha/:
 *   get:
 *     summary: Lista todas as fichas do usuário logado
 *     tags: [Ficha Alimentar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de fichas alimentares
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
 *                   objetivo:
 *                     type: string
 *                     example: perder peso
 *                   total_kcal:
 *                     type: number
 *                     example: 1200
 *                   total_proteina:
 *                     type: number
 *                     example: 80
 *                   total_carboidratos:
 *                     type: number
 *                     example: 150
 *                   total_gordura:
 *                     type: number
 *                     example: 40
 *                   data_criacao:
 *                     type: string
 *                     example: 2025-09-21T15:30:00Z
 */
router.get('/', authMiddleware, fichaController.listarFichas);

/**
 * @swagger
 * /ficha/{id}:
 *   delete:
 *     summary: Deleta uma ficha alimentar pelo ID
 *     tags: [Ficha Alimentar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: ID da ficha a ser deletada
 *     responses:
 *       200:
 *         description: Ficha deletada com sucesso
 *       400:
 *         description: ID inválido
 *       401:
 *         description: Usuário não autenticado
 */
router.delete(
  '/:id',
  authMiddleware,
  [param('id').isInt({ min: 1 }).withMessage('ID deve ser um número inteiro válido.')],
  fichaController.deletarFicha
);

/**
 * @swagger
 * /ficha/recomendar:
 *   post:
 *     summary: Recomenda uma dieta baseada no objetivo do usuário
 *     tags: [Ficha Alimentar]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               objetivo:
 *                 type: string
 *                 enum: [perder_peso, ganhar_massa, manter_saude]
 *                 example: perder_peso
 *     responses:
 *       200:
 *         description: Recomendação de dieta gerada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recomendacao:
 *                   type: string
 *                   example: "Sugestão de refeição: 100g de frango, 50g de arroz integral..."
 *       400:
 *         description: Objetivo inválido
 */
router.post(
  '/recomendar',
  authMiddleware,
  [
    body('objetivo')
      .isIn(['perder_peso', 'ganhar_massa', 'manter_saude'])
      .withMessage('Objetivo deve ser perder_peso, ganhar_massa ou manter_saude.'),
  ],
  fichaController.recomendarDieta
);

module.exports = router;
