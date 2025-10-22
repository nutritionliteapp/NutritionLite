const express = require('express'); 
const app = express();
const cors = require('cors');
const { limiteGeral } = require('./middlewares/rateLimiter');
const { swaggerUi, specs } = require('./swagger');

const userRoutes = require('./routes/userRoutes');
const alimentosRoutes = require('./routes/alimentosRoutes');
const fichaRoutes = require('./routes/fichaRoutes');
const testeConexaoRoutes = require('./routes/testeConexaoRoutes');
const chatRoutes = require('./routes/chatRoutes');

const precoRoutes = require('./routes/precoRoutes');

const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });

  if (Sentry.Handlers?.requestHandler) {
    app.use(Sentry.Handlers.requestHandler());
  }
}

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(limiteGeral);


app.use('/api/usuarios', userRoutes);
app.use('/api/alimentos', alimentosRoutes);
app.use('/api/ficha', fichaRoutes);
app.use('/api/teste', testeConexaoRoutes);
app.use('/api/chat', require ('./routes/chatRoutes'));
console.log("🚀 Rota /api/chat registrada");
app.use('/api/preco', precoRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

if (process.env.SENTRY_DSN && Sentry.Handlers?.errorHandler) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(errorHandler);

app.get('/', (req, res) => {
  res.send('Bem vindo à API NutritionLite');
});

module.exports = app;