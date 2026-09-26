const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middlewares/authMiddlewares');
const c = require('../controllers/lembreteController');

/** O envio de teste manda uma notificação de verdade: poucas por hora. */
const limiteTeste = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { status: '429', message: 'Muitos testes de notificação. Tente mais tarde.', mensagem: 'Muitos testes de notificação. Tente mais tarde.' },
});

/**
 * @swagger
 * /api/lembretes/config:
 *   get:
 *     summary: Se os lembretes por notificação estão disponíveis (VAPID configurado) e a chave pública
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 */
router.get('/config', authMiddleware, c.configuracao);
router.post('/estado', authMiddleware, c.estado);
router.put('/', authMiddleware, c.salvar);
router.delete('/', authMiddleware, c.remover);
router.post('/teste', authMiddleware, limiteTeste, c.testar);

module.exports = router;
