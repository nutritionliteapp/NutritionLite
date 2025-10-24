const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddlewares');
const { validarCadastroUsuario, validarLogin } = require('../middlewares/validacoesUsuarios');
const validarErros = require('../middlewares/validarErros');
const { limiteLogin } = require('../middlewares/rateLimiter');

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Rotas de cadastro, login, perfil e exclusão de usuário
 */

/**
 * @swagger
 * /usuario/cadastro:
 *   post:
 *     summary: Cadastra um novo usuário
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Miguel
 *               email:
 *                 type: string
 *                 example: miguel@email.com
 *               senha:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/cadastro', validarCadastroUsuario, validarErros, userController.cadastrarUsuario);

/**
 * @swagger
 * /usuario/login:
 *   post:
 *     summary: Faz login e retorna token JWT
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: miguel@email.com
 *               senha:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login bem-sucedido com token
 *       400:
 *         description: Dados inválidos
 *       429:
 *         description: Muitas tentativas de login
 */
router.post('/login', limiteLogin, validarLogin, validarErros, userController.loginUsuario);

/**
 * @swagger
 * /usuario/deletar:
 *   delete:
 *     summary: Deleta o usuário logado
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuário deletado com sucesso
 *       401:
 *         description: Usuário não autenticado
 */
router.delete('/deletar', authMiddleware, userController.deletarUsuario);

/**
 * @swagger
 * /usuario/perfil:
 *   get:
 *     summary: Retorna dados do perfil do usuário logado
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil acessado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensagem:
 *                   type: string
 *                   example: Perfil acessado com sucesso!
 *                 usuario:
 *                   type: object
 *                   example:
 *                     id: 1
 *                     nome: Miguel
 *                     email: miguel@email.com
 */
router.get('/perfil', authMiddleware, (req, res) => {
  res.status(200).json({
    mensagem: 'Perfil acessado com sucesso!',
    usuario: req.usuario
  });
});

module.exports = router;
