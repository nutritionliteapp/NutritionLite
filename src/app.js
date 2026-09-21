/* Sentry deve inicializar antes do Express (SDK v9). */
const { initSentry, Sentry } = require('./config/sentry');
if (process.env.NODE_ENV !== 'test') {
  initSentry();
}

const express = require('express');
const app = express();
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { limiteGeral } = require('./middlewares/rateLimiter');
const { swaggerUi, specs } = require('./swagger');
const logger = require('./utils/logger');
const { renderPaginaStatus } = require('./utils/paginaStatus');
const {
  errorHandler,
  notFoundHandler,
} = require('./middlewares/errorHandler');

/* Rotas */
const userRoutes = require('./routes/userRoutes');
const alimentosRoutes = require('./routes/alimentosRoutes');
const fichaRoutes = require('./routes/fichaRoutes');
const testeConexaoRoutes = require('./routes/testeConexaoRoutes');
const chatRoutes = require('./routes/chatRoutes');
const precoRoutes = require('./routes/precoRoutes');
const noticiasRoutes = require('./routes/noticiasRoutes');
const rotulosRoutes = require('./routes/rotulosRoutes');
const usoRoutes = require('./routes/usoRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

app.set('trust proxy', 1);

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
        ],
        /* As views usam onclick/onerror inline; o padrão do helmet ('none') os bloqueia. */
        "script-src-attr": ["'unsafe-inline'"],
        /* unpkg.com: Boxicons (CSS + fontes) usados em todas as páginas. */
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
        ],
        "img-src": ["'self'", 'data:', 'blob:', 'https:'],
        "font-src": [
          "'self'",
          'https://fonts.gstatic.com',
          'https://unpkg.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'data:',
        ],
        "connect-src": ["'self'", ...corsOrigins],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        /* Fora de produção (HTTP puro, ex.: acesso pela rede local) o upgrade quebraria todos os assets. */
        ...(process.env.NODE_ENV === 'production'
          ? {}
          : { "upgrade-insecure-requests": null }),
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

const publicPath = path.join(__dirname, '..', 'public');
if (process.env.NODE_ENV !== 'production') {
  logger.debug(`Pasta pública: ${publicPath}`);
  app.use((req, res, next) => {
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|avif|woff|woff2)$/)) {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
    }
    next();
  });
}

app.use(express.static(publicPath));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(limiteGeral);

app.use('/api/usuarios', userRoutes);
app.use('/api/alimentos', alimentosRoutes);
app.use('/api/ficha', fichaRoutes);
app.use('/api/teste', testeConexaoRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/preco', precoRoutes);
app.use('/api/noticias', noticiasRoutes);
app.use('/api/rotulos', rotulosRoutes);
app.use('/api/uso', usoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.setupExpressErrorHandler(app);
}

/* Raiz do site: página pública de apresentação (landing) */
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, 'Views', 'landing.html'));
});

/* /home: início de quem está logado (antes era /dashboard; a apresentação pública passou para "/") */
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

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'dashboard.html'));
});

app.get('/ficha', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'Views', 'ficha.html'));
});

app.get('/minhas-fichas', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'Views', 'minhas-fichas.html'));
});

app.get('/rotulos', (req, res) => {
  res.sendFile(path.join(__dirname, 'Views', 'rotulos.html'));
});

/* /login.html, /home.html… → rota sem extensão (era 404 com a tela padrão do Express) */
const PAGINAS = [
  'home', 'login', 'chat', 'noticias', 'novasenha', 'perfil', 'recuperacaodesenha',
  'taco', 'dashboard', 'ficha', 'minhas-fichas', 'rotulos',
];
app.get(/^\/([a-z-]+)\.html$/, (req, res, next) => {
  const pagina = req.params[0];
  if (!PAGINAS.includes(pagina)) return next();
  const busca = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(301, `/${pagina}${busca}`);
});

/* 404 apenas para API — páginas HTML acima têm prioridade */
app.use('/api', notFoundHandler);

/* 404 de páginas: tela no visual do sistema (antes, a tela padrão do Express em inglês) */
app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFoundHandler(req, res);
  return res.status(404).send(
    renderPaginaStatus({
      tipo: 'info',
      titulo: 'Página não encontrada',
      mensagem: 'O endereço que você abriu não existe ou foi movido.',
      acoes: [
        { texto: 'Ir para o início', href: '/', primaria: true },
        { texto: 'Entrar', href: '/login' },
      ],
    })
  );
});
app.use(errorHandler);

module.exports = app;
