const fs = require('fs');
const path = require('path');

const { renderEmail } = require('../src/utils/emailTemplate');

describe('Modelo de e-mail — visual da marca com estilo inline', () => {
  const email = renderEmail({
    titulo: 'Redefinição de senha',
    preheader: 'Use o link para criar uma nova senha.',
    paragrafos: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
    botao: { texto: 'Redefinir senha', url: 'https://app.exemplo.com/novasenha?token=abc' },
    rodape: 'Se você não solicitou, ignore.',
  });

  test('todo o estilo é inline (clientes de e-mail ignoram CSS externo)', () => {
    expect(email.html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(email.html).not.toMatch(/<style[\s>]/i);
    expect(email.html).toMatch(/style="[^"]*background-color:#55e098/); // faixa e botão mint da marca
    expect(email.html).toMatch(/color:#053b26/); // texto escuro sobre mint (contraste legível)
  });

  test('traz o botão de ação com o link, o link em texto e o pré-cabeçalho', () => {
    expect(email.html).toMatch(/<a href="https:\/\/app\.exemplo\.com\/novasenha\?token=abc"[^>]*>Redefinir senha<\/a>/);
    expect(email.html).toContain('Se o botão não funcionar');
    expect(email.html).toContain('Use o link para criar uma nova senha.');
    expect(email.html).toMatch(/^<!DOCTYPE html>/);
  });

  test('gera a versão em texto puro com o link', () => {
    expect(email.text).toContain('Redefinição de senha');
    expect(email.text).toContain('Redefinir senha: https://app.exemplo.com/novasenha?token=abc');
    expect(email.text).toContain('Se você não solicitou, ignore.');
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  test('escapa título, parágrafos, botão e URL (nada dinâmico vira HTML)', () => {
    const malicioso = renderEmail({
      titulo: '<script>x()</script>',
      paragrafos: ['<img src=x onerror=alert(1)>'],
      botao: { texto: '<b>ir</b>', url: 'https://a.com/"><script>y()</script>' },
      rodape: '<i>rodapé</i>',
    });

    expect(malicioso.html).not.toContain('<script>');
    expect(malicioso.html).not.toContain('<img src=x');
    expect(malicioso.html).not.toContain('<b>ir</b>');
    expect(malicioso.html).not.toContain('<i>rodapé</i>');
    expect(malicioso.html).not.toMatch(/href="https:\/\/a\.com\/">/);
  });

  test('sem botão não mostra o aviso de link', () => {
    const simples = renderEmail({ titulo: 'Aviso', paragrafos: ['Só texto.'] });

    expect(simples.html).not.toContain('Se o botão não funcionar');
    expect(simples.text).not.toContain('undefined');
  });
});

describe('Tela "Nova senha" — confirmação de senha', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Views', 'novasenha.html'), 'utf8');

  test('o campo de confirmação tem nome e é conferido antes de enviar', () => {
    expect(html).toContain('name="confirmarSenha"');
    expect(html).toMatch(/novaSenha !== this\.confirmarSenha\.value/);
    expect(html).toContain('As senhas não conferem');
  });

  test('a conferência acontece antes do envio ao servidor', () => {
    expect(html.indexOf('As senhas não conferem')).toBeLessThan(html.indexOf("fetch('/api/usuarios/novasenha'"));
  });
});
