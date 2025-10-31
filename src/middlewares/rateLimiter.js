const rateLimit = require('express-rate-limit');

const limiteGeral = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        status: '429',
        message: 'Calma aí! Você está fazendo muitas requisições. Tente novamente mais tarde.'
    },
    // Ignorar arquivos estáticos (CSS, JS, imagens, etc)
    skip: (req) => {
        const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.avif'];
        return staticExtensions.some(ext => req.path.endsWith(ext));
    }
});

const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        status: '429',
        message: 'Muitas tentativas de login. Tente novamente mais tarde.'
    }
});

module.exports = {
    limiteGeral,
    limiteLogin
};
