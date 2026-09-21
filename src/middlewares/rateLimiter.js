const rateLimit = require('express-rate-limit');

/*
 * `message` é o formato original; `mensagem` é o campo lido pelo front-end
 * (login, chat, rótulos), que sem ele exibia "undefined".
 */
function respostaLimite(texto) {
  return { status: '429', message: texto, mensagem: texto };
}

const limiteGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: respostaLimite(
    'Calma aí! Você está fazendo muitas requisições. Tente novamente mais tarde.'
  ),
  skip: (req) => {
    const staticExtensions = [
      '.css',
      '.js',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
      '.ico',
      '.woff',
      '.woff2',
      '.ttf',
      '.avif',
    ];
    return staticExtensions.some((ext) => req.path.endsWith(ext));
  },
});

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Só falhas contam: vários usuários atrás do mesmo IP (escola, wi-fi) não se bloqueiam ao logar com sucesso.
  skipSuccessfulRequests: true,
  message: respostaLimite('Muitas tentativas de login. Tente novamente mais tarde.'),
});

/** Rotas que disparam e-mail para um endereço arbitrário (cadastro, recuperação de senha). */
const limiteEmail = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: respostaLimite(
    'Muitas solicitações de e-mail. Aguarde alguns minutos e tente novamente.'
  ),
});

/** Chat com IA — mais restrito que o limite geral. */
const limiteChat = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: respostaLimite(
    'Limite de mensagens do chat atingido. Aguarde alguns minutos e tente novamente.'
  ),
});

/** Análise de rótulos (visão) — mais restrito que o chat. */
const limiteRotulos = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: respostaLimite(
    'Limite de análises de rótulos atingido. Aguarde alguns minutos e tente novamente.'
  ),
});

module.exports = {
  limiteGeral,
  limiteLogin,
  limiteEmail,
  limiteChat,
  limiteRotulos,
};
