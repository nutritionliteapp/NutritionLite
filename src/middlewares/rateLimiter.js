const rateLimit = require('express-rate-limit');

const limiteGeral = rateLimit({
    windowMs: 15 * 60 * 1000,
<<<<<<< HEAD
    max: 1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000,
=======
    max: 10,
>>>>>>> 950a12fb089d73fb26bc43df74781d2e80b33f5b
    message: {
        status: '429',
        message: 'Calma aí! Você está fazendo muitas requisições. Tente novamente mais tarde.'
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
