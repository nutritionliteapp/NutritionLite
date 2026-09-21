// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const  authMiddleware  = require('../middlewares/authMiddlewares');
const { validarCadastroUsuario, validarLogin, validarReenvioConfirmacao, validarNovaSenha } = require('../middlewares/validacoesUsuarios');
const validarErros = require('../middlewares/validarErros');
const { limiteLogin, limiteEmail } = require('../middlewares/rateLimiter');
const { buscarPerfil, buscarDadosDashboard } = require('../controllers/userController');

// cadastro (agora envia email de confirmação)
router.post('/cadastro', limiteEmail, validarCadastroUsuario, validarErros, userController.cadastrarUsuario);

// confirmar email
router.get('/confirmar-email/:token', userController.confirmarEmail);

// reenviar o link de confirmação (resposta sempre neutra; no máximo 1 e-mail por minuto por conta)
router.post('/reenviar-confirmacao', limiteEmail, validarReenvioConfirmacao, validarErros, userController.reenviarConfirmacao);

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
router.post('/recuperacaodesenha', limiteEmail, userController.forgotPassword);
router.post('/novasenha', validarNovaSenha, validarErros, userController.resetPassword);



module.exports = router;
