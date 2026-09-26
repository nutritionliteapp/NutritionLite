require('dotenv').config();

const { validateEnv } = require('./src/config/env');
const logger = require('./src/utils/logger');

validateEnv({ exitOnError: true });

const app = require('./src/app');
const { iniciarAgendador } = require('./src/services/lembretes');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`NutritionLite API ouvindo na porta ${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  iniciarAgendador(); // lembretes por notificação (só liga se VAPID estiver configurado)
});
