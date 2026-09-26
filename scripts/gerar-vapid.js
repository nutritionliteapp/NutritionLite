/**
 * Gera as chaves VAPID dos lembretes por notificação. Rode UMA vez e cole as linhas no .env
 * (local e no servidor de produção). Nunca commite a chave privada.
 *
 *   npm run vapid
 */
const webpush = require('web-push');

const chaves = webpush.generateVAPIDKeys();

console.log('Cole estas linhas no seu .env (e nas variáveis do servidor):\n');
console.log(`VAPID_PUBLIC_KEY=${chaves.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${chaves.privateKey}`);
console.log('VAPID_SUBJECT=mailto:seu-email@exemplo.com');
console.log('\nDepois reinicie o servidor. Sem essas variáveis os lembretes ficam desligados.');
