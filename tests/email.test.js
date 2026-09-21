process.env.NODE_ENV = 'test';
process.env.SMTP_URL = 'smtp://usuario:senha@localhost:2525';
process.env.BASE_URL = 'https://app.exemplo.com';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'id-1' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: mockSendMail,
  })),
}));

const { enviarEmailConfirmacao, escapeHtml } = require('../src/utils/emailService');

describe('E-mail de confirmação', () => {
  beforeEach(() => mockSendMail.mockClear());

  test('nome digitado no cadastro não injeta HTML no e-mail', async () => {
    const nomeMalicioso = '<a href="https://phishing.example">Clique aqui</a><script>x()</script>';

    await enviarEmailConfirmacao('vitima@exemplo.com', nomeMalicioso, 'tok123');

    const { html } = mockSendMail.mock.calls[0][0];
    expect(html).not.toContain('phishing.example">');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;a href=&quot;https://phishing.example&quot;&gt;');
  });

  test('mantém o link de confirmação e o nome comum intactos', async () => {
    await enviarEmailConfirmacao('ana@exemplo.com', 'Ana Souza', 'tok123');

    const { html, to } = mockSendMail.mock.calls[0][0];
    expect(to).toBe('ana@exemplo.com');
    expect(html).toContain('Olá Ana Souza!');
    expect(html).toContain('https://app.exemplo.com/api/usuarios/confirmar-email/tok123');
  });

  test('vai com a versão em texto e com o visual da marca (estilo inline)', async () => {
    await enviarEmailConfirmacao('ana@exemplo.com', 'Ana', 'tok123');

    const { html, text } = mockSendMail.mock.calls[0][0];
    expect(text).toContain('https://app.exemplo.com/api/usuarios/confirmar-email/tok123');
    expect(html).toMatch(/background-color:#55e098/);
    expect(html).toContain('Confirmar meu e-mail');
  });

  test('escapeHtml cobre & < > " \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
