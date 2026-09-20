const express = require('express');
const router = express.Router();

/**
 * Endpoint público de atualização em massa de preços foi removido.
 * Use o job administrativo: `node scripts/atualizar-precos-estimados.js`
 * (requer ADMIN_JOB_SECRET no ambiente).
 */
router.post('/precos/auto', (req, res) => {
  return res.status(410).json({
    sucesso: false,
    mensagem:
      'Este endpoint foi desativado. Use o script administrativo atualizar-precos-estimados.js.',
  });
});

module.exports = router;
