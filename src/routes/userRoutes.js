// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddlewares');
const { validarCadastroUsuario, validarLogin } = require('../middlewares/validacoesUsuarios');
const validarErros = require('../middlewares/validarErros');
const { limiteLogin } = require('../middlewares/rateLimiter');

// cadastro (agora envia email de confirmação)
router.post('/cadastro', validarCadastroUsuario, validarErros, userController.cadastrarUsuario);

// confirmar email
router.get('/confirmar-email/:token', userController.confirmarEmail);

// login (bloqueia se email não confirmado)
router.post('/login', limiteLogin, validarLogin, validarErros, userController.loginUsuario);

// perfil
router.get('/perfil', authMiddleware, (req, res) => {
  res.status(200).json({
    mensagem: 'Perfil acessado com sucesso!',
    usuario: req.usuario
  });
});

// deletar usuario
router.delete('/deletar', authMiddleware, userController.deletarUsuario);

// recuperacao de senha
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password", userController.resetPassword);

module.exports = router;
