/**
 * Gera um JWT_SECRET forte (64 caracteres hexadecimais = 256 bits).
 *
 *   npm run segredo
 *
 * Trocar o segredo desloga todo mundo uma vez (os tokens antigos deixam de valer).
 */
const crypto = require('crypto');

console.log('Cole no seu .env (e nas variáveis do servidor), substituindo o JWT_SECRET atual:\n');
console.log(`JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
