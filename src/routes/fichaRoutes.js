const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const fichaController = require('../controllers/fichaController');
const authMiddleware = require('../middlewares/authMiddlewares');
const validarErros = require('../middlewares/validarErros');

/**
 * @swagger
 * tags:
 *   name: Ficha Alimentar
 *   description: Rotas para criação, listagem, exclusão e recomendação de dietas
 */

/**
 * @swagger
 * /api/ficha/refeicao:
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
 *             required: [objetivo, alimentos]
 *             properties:
 *               objetivo:
 *                 type: string
 *                 example: perder peso
 *               alimentos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     food_id:
 *                       type: integer
 *                       example: 1
 *                     quantity_g:
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
      .isString()
      .withMessage('O objetivo deve ser um texto válido.')
      .isLength({ min: 3 })
      .withMessage('O objetivo deve ter pelo menos 3 caracteres.'),
    body('alimentos')
      .isArray({ min: 1 })
      .withMessage('A lista de alimentos deve conter ao menos 1 item.'),
  ],
  validarErros,
  fichaController.criarFicha
);

/**
 * @swagger
 * /api/ficha:
 *   get:
 *     summary: Lista todas as fichas do usuário logado
 *     tags: [Ficha Alimentar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de fichas alimentares
 */
router.get('/', authMiddleware, fichaController.listarFichas);

/**
 * @swagger
 * /api/ficha/objetivo:
 *   put:
 *     summary: Atualiza o objetivo da ficha mais recente do usuário
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
 *     responses:
 *       200:
 *         description: Objetivo atualizado
 *       400:
 *         description: Objetivo inválido
 */
router.put(
  '/objetivo',
  authMiddleware,
  [
    body('objetivo')
      .isIn(['perder_peso', 'ganhar_massa', 'manter_saude'])
      .withMessage('Objetivo deve ser perder_peso, ganhar_massa ou manter_saude.'),
  ],
  validarErros,
  fichaController.atualizarObjetivoFicha
);

/**
 * @swagger
 * /api/ficha/recomendar:
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
 *     responses:
 *       200:
 *         description: Recomendação de dieta gerada
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
  validarErros,
  fichaController.recomendarDieta
);

/**
 * @swagger
 * /api/ficha/{id}:
 *   get:
 *     summary: Retorna uma ficha alimentar específica pelo ID
 *     tags: [Ficha Alimentar]
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
 *         description: Detalhes da ficha alimentar
 *       404:
 *         description: Ficha não encontrada
 */
router.get(
  '/:id',
  authMiddleware,
  [param('id').isInt({ min: 1 }).withMessage('ID deve ser um número inteiro válido.')],
  validarErros,
  fichaController.buscarFichaPorId
);

/**
 * @swagger
 * /api/ficha/{id}:
 *   put:
 *     summary: Atualiza uma ficha alimentar completa pelo ID
 *     tags: [Ficha Alimentar]
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
 *         description: Ficha atualizada com sucesso
 *       404:
 *         description: Ficha não encontrada
 */
router.put(
  '/:id',
  authMiddleware,
  [
    param('id').isInt({ min: 1 }).withMessage('ID deve ser um número inteiro válido.'),
    body('objetivo')
      .isIn(['perder_peso', 'ganhar_massa', 'manter_saude'])
      .withMessage('Objetivo deve ser perder_peso, ganhar_massa ou manter_saude.'),
    body('alimentos')
      .isArray({ min: 1 })
      .withMessage('A lista de alimentos deve conter ao menos 1 item.'),
  ],
  validarErros,
  fichaController.atualizarFicha
);

/**
 * @swagger
 * /api/ficha/{id}:
 *   delete:
 *     summary: Exclui uma ficha alimentar do usuário logado
 *     tags: [Ficha Alimentar]
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
 *         description: Ficha excluída
 *       404:
 *         description: Ficha não encontrada
 */
router.delete(
  '/:id',
  authMiddleware,
  [param('id').isInt({ min: 1 }).withMessage('ID deve ser um número inteiro válido.')],
  validarErros,
  fichaController.deletarFicha
);

module.exports = router;
