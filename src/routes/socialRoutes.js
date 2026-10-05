const express = require('express');
const router = express.Router();
const { limiteLogin } = require('../middlewares/rateLimiter');
const social = require('../controllers/socialController');

/** Entrar com Google / Facebook */
router.get('/social/:provedor', limiteLogin, social.iniciar);
router.get('/social/:provedor/callback', limiteLogin, social.retorno);

module.exports = router;
