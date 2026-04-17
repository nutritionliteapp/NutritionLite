const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const { analisarRotulos } = require('../controllers/rotulosController');

/** Análise de rótulos com visão (Gemini) — requer login */
router.post('/analisar', authMiddleware, analisarRotulos);

module.exports = router;
