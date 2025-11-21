// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const  authMiddleware  = require('../middlewares/authMiddlewares');
const { validarCadastroUsuario, validarLogin } = require('../middlewares/validacoesUsuarios');
const validarErros = require('../middlewares/validarErros');
const { limiteLogin } = require('../middlewares/rateLimiter');
const { buscarPerfil } = require("../controllers/userController");

// cadastro (agora envia email de confirmação)
router.post('/cadastro', validarCadastroUsuario, validarErros, userController.cadastrarUsuario);

// confirmar email
router.get('/confirmar-email/:token', userController.confirmarEmail);

// login (bloqueia se email não confirmado)
router.post('/login', limiteLogin, validarLogin, validarErros, userController.loginUsuario);

// perfil
router.get("/perfil", authMiddleware, buscarPerfil);

// deletar usuario
router.delete('/deletar', authMiddleware, userController.deletarUsuario);

// recuperacao de senha
router.post("/recuperacaodesenha", userController.forgotPassword);
router.post("/novasenha", userController.resetPassword);

module.exports = router;
