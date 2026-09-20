// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const  authMiddleware  = require('../middlewares/authMiddlewares');
const { validarCadastroUsuario, validarLogin, validarNovaSenha } = require('../middlewares/validacoesUsuarios');
const validarErros = require('../middlewares/validarErros');
const { limiteLogin } = require('../middlewares/rateLimiter');
const { buscarPerfil, buscarDadosDashboard } = require('../controllers/userController');

// cadastro (agora envia email de confirmação)
router.post('/cadastro', validarCadastroUsuario, validarErros, userController.cadastrarUsuario);

// confirmar email
router.get('/confirmar-email/:token', userController.confirmarEmail);

// login (bloqueia se email não confirmado)
router.post('/login', limiteLogin, validarLogin, validarErros, userController.loginUsuario);

// perfil
router.get('/perfil', authMiddleware, buscarPerfil);

// dados do dashboard
router.get('/dashboard', authMiddleware, buscarDadosDashboard);

// Atualização de dados pessoais e metas
router.put('/perfil', authMiddleware, userController.atualizarPerfil);
router.put('/metas', authMiddleware, userController.atualizarMetas);

// deletar usuario
router.delete('/deletar', authMiddleware, userController.deletarUsuario);

// recuperacao de senha
router.post('/recuperacaodesenha', userController.forgotPassword);
router.post('/novasenha', validarNovaSenha, validarErros, userController.resetPassword);



module.exports = router;
