const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const { limiteRotulos } = require('../middlewares/rateLimiter');
const { limiteIAUsuario } = require('../middlewares/limiteIA');
const { analisarRotulos, buscarPorCodigo } = require('../controllers/rotulosController');

/** Análise de rótulos com visão (Gemini) — requer login */
router.post('/analisar', authMiddleware, limiteRotulos, limiteIAUsuario('rotulos'), analisarRotulos);

/** Leitura por código de barras (Open Food Facts): sem IA, sem cota de IA — requer login */
router.get('/codigo/:ean', authMiddleware, buscarPorCodigo);

module.exports = router;
