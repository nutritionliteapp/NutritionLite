const express = require('express');
const router = express.Router();
const { buscarFeedNoticias } = require('../controllers/noticiasController');

/**
 * Notícias reais via RSS (G1 Saúde + GE). Sem autenticação — página pública.
 */
router.get('/feed', buscarFeedNoticias);

module.exports = router;
