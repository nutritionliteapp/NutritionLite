/** E-mail por API HTTPS (Brevo/Resend): necessário em hospedagens que bloqueiam SMTP, como o Render gratuito. */
process.env.NODE_ENV = 'test';
process.env.SMTP_URL = 'smtp://usuario:senha@localhost:2525';
process.env.BASE_URL = 'https://app.exemplo.com';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ verify: jest.fn().mockResolvedValue(true), sendMail: mockSendMail })),
}));

const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

const { enviarEmail, enviarEmailConfirmacao, separarRemetente, provedorApi } = require('../src/utils/emailService');

beforeEach(() => {
  mockPost.mockReset();
  mockSendMail.mockClear();
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.BREVO_SENDER_EMAIL;
  delete process.env.EMAIL_FROM;
});

test('sem chave de API continua usando SMTP (comportamento anterior)', async () => {
  expect(provedorApi()).toBeNull();
  await enviarEmail('a@a.com', 'Oi', '<p>x</p>', 'x');
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  expect(mockPost).not.toHaveBeenCalled();
});

test('com BREVO_API_KEY envia pela API HTTPS, sem tocar no SMTP', async () => {
  process.env.BREVO_API_KEY = 'chave-brevo';
  process.env.BREVO_SENDER_EMAIL = 'remetente@exemplo.com';
  process.env.EMAIL_FROM = '"NutritionLite" <ignorado@x.com>';
  mockPost.mockResolvedValue({ data: { messageId: '<abc@brevo>' } });

  const info = await enviarEmail('ana@exemplo.com', 'Confirme', '<p>oi</p>', 'oi');

  expect(info.messageId).toBe('<abc@brevo>');
  expect(mockSendMail).not.toHaveBeenCalled();
  const [url, corpo, opcoes] = mockPost.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(opcoes.headers['api-key']).toBe('chave-brevo');
  expect(corpo).toMatchObject({
    sender: { name: 'NutritionLite', email: 'remetente@exemplo.com' },
    to: [{ email: 'ana@exemplo.com' }],
    subject: 'Confirme',
    htmlContent: '<p>oi</p>',
    textContent: 'oi',
  });
});

test('com RESEND_API_KEY usa a API do Resend', async () => {
  process.env.RESEND_API_KEY = 're_chave';
  process.env.EMAIL_FROM = '"NutritionLite" <ola@meudominio.com>';
  mockPost.mockResolvedValue({ data: { id: 'res-1' } });

  await enviarEmail('ana@exemplo.com', 'Oi', '<p>x</p>');

  const [url, corpo, opcoes] = mockPost.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(opcoes.headers.Authorization).toBe('Bearer re_chave');
  expect(corpo).toMatchObject({ from: 'NutritionLite <ola@meudominio.com>', to: ['ana@exemplo.com'] });
});

test('o e-mail de confirmação também sai pela API e carrega o link', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_SENDER_EMAIL = 'r@x.com';
  mockPost.mockResolvedValue({ data: { messageId: 'm' } });

  await enviarEmailConfirmacao('ana@exemplo.com', 'Ana', 'tok123');

  expect(mockPost.mock.calls[0][1].htmlContent).toContain('https://app.exemplo.com/api/usuarios/confirmar-email/tok123');
});

test('erro do provedor propaga (para o chamador registrar) e não vaza a chave no log', async () => {
  process.env.BREVO_API_KEY = 'SEGREDO-DA-CHAVE';
  process.env.BREVO_SENDER_EMAIL = 'r@x.com';
  mockPost.mockRejectedValue(Object.assign(new Error('falhou'), { response: { status: 400, data: { message: 'sender not valid' } } }));

  await expect(enviarEmail('a@a.com', 'x', '<p>x</p>')).rejects.toThrow('falhou');
});

test('separa nome e e-mail do remetente', () => {
  expect(separarRemetente('"NutritionLite" <a@b.com>')).toEqual({ nome: 'NutritionLite', email: 'a@b.com' });
  expect(separarRemetente('Equipe Nutri <n@x.com>')).toEqual({ nome: 'Equipe Nutri', email: 'n@x.com' });
  expect(separarRemetente('soemail@x.com')).toEqual({ nome: 'NutritionLite', email: 'soemail@x.com' });
});
