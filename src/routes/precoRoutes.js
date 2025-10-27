const express = require('express');
const router = express.Router();
const { preencherAlimentos } = require('../controllers/precoController');

router.post('/precos/auto', preencherAlimentos);

module.exports = router;
