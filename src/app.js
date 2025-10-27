/*Frameworks*/ 
const express = require('express'); 
const app = express();
const cors = require('cors');
const { limiteGeral } = require('./middlewares/rateLimiter');
const { swaggerUi, specs } = require('./swagger');
const Sentry = require('@sentry/node');
const path = require('path');
const fileURLToPath = require('url').fileURLToPath;
const { errorHandler } = require('./middlewares/errorHandler');

/*Rotas*/
const userRoutes = require('./routes/userRoutes');
const alimentosRoutes = require('./routes/alimentosRoutes');
const fichaRoutes = require('./routes/fichaRoutes');
const testeConexaoRoutes = require('./routes/testeConexaoRoutes');
const chatRoutes = require('./routes/chatRoutes');

const precoRoutes = require('./routes/precoRoutes');


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

/*Middlewares*/
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(limiteGeral);
app.use(express.urlencoded({ extended: true }));


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

//app.use(errorHandler);

app.get('/', (req, res) => {
  res.send('Bem vindo à API NutritionLite');
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'home.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'chat.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'login.html'));
});

app.get('/noticias', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'noticias.html'));
});

app.get('/novasenha', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'novasenha.html'));
});

app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'perfil.html'));
});

app.get('/recuperacaodesenha', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'recuperacaodesenha.html'));
});

app.get('/taco', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'taco.html'));
});

module.exports = app;