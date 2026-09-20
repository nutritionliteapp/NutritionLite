process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

jest.mock('../src/utils/emailService', () => ({
  enviarEmailConfirmacao: jest.fn().mockResolvedValue(true),
  enviarEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/config/db', () => {
  class Request {
    constructor() {
      this.inputs = {};
    }
    input(k, _t, v) {
      this.inputs[k] = v;
      return this;
    }
    async query(q) {
      if (q.includes('INSERT INTO chatHistorico')) {
        return { recordset: [], rowsAffected: [1] };
      }
      if (q.includes('FROM fichaAlimentar')) {
        return { recordset: [] };
      }
      if (q.includes('FROM tbltacoNL')) {
        return { recordset: [] };
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }

  return {
    sql: {
      Int: 'Int',
      NVarChar: 'NVarChar',
      VarChar: 'VarChar',
    },
    poolPromise: Promise.resolve({
      request: () => new Request(),
    }),
  };
});

const {
  conversarComIA,
  MODOS_VALIDOS,
  MAX_MENSAGEM_CHARS,
  MAX_SESSOES_EM_MEMORIA,
  MAX_SESSION_ID_CHARS,
  _test,
} = require('../src/controllers/chatController');

function mockReqRes({ userId, body }) {
  const req = {
    usuario: { id: userId },
    body,
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

describe('Chat — validações e isolamento de sessão', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'Resposta mock da Salus sobre alimentação.' },
    });
    _test.clearAllSessionHistories();
  });

  test('rejeita modo inválido com 400', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: { mensagem: 'Olá', modo: 'hackerman' },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.mensagem).toMatch(/modo inválido/i);
    expect(res.body.modos_validos).toEqual([...MODOS_VALIDOS]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('rejeita mensagem acima do limite de caracteres', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: {
        mensagem: 'x'.repeat(MAX_MENSAGEM_CHARS + 1),
        modo: 'geral',
      },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.mensagem).toMatch(/muito longa/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('aceita modo válido e retorna session_id', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: { mensagem: 'Monte um café da manhã equilibrado', modo: 'dieta' },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.session_id).toEqual(expect.any(String));
    expect(res.body.resposta).toEqual(expect.any(String));
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  test('não compartilha histórico entre dois usuários', async () => {
    const sessionA = 'sessao-user-1';
    const sessionB = 'sessao-user-2';

    const call1 = mockReqRes({
      userId: 1,
      body: {
        mensagem: 'Quero dicas de proteínas vegetais para o almoço',
        modo: 'geral',
        session_id: sessionA,
      },
    });
    await conversarComIA(call1.req, call1.res);
    expect(call1.res.statusCode).toBe(200);
    expect(call1.res.body.session_id).toBe(sessionA);

    const call2 = mockReqRes({
      userId: 2,
      body: {
        mensagem: 'Como montar um jantar leve pós-treino',
        modo: 'treino',
        session_id: sessionB,
      },
    });
    await conversarComIA(call2.req, call2.res);
    expect(call2.res.statusCode).toBe(200);
    expect(call2.res.body.session_id).toBe(sessionB);

    const hist1 = _test.getHistorySnapshot(1, sessionA);
    const hist2 = _test.getHistorySnapshot(2, sessionB);

    expect(hist1.length).toBeGreaterThanOrEqual(2);
    expect(hist2.length).toBeGreaterThanOrEqual(2);

    const textosUser1 = hist1.filter((m) => m.role === 'user').map((m) => m.content);
    const textosUser2 = hist2.filter((m) => m.role === 'user').map((m) => m.content);

    expect(textosUser1).toContain('Quero dicas de proteínas vegetais para o almoço');
    expect(textosUser1).not.toContain('Como montar um jantar leve pós-treino');
    expect(textosUser2).toContain('Como montar um jantar leve pós-treino');
    expect(textosUser2).not.toContain('Quero dicas de proteínas vegetais para o almoço');

    // Mesmo session_id string sob usuários diferentes = chaves distintas
    expect(_test.sessionKey(1, sessionA)).not.toBe(_test.sessionKey(2, sessionA));
  });

  test('não envia a mensagem atual duas vezes no prompt do Gemini', async () => {
    const mensagem = 'Explique o que são fibras alimentares';
    const { req, res } = mockReqRes({
      userId: 7,
      body: { mensagem, modo: 'educacao', session_id: 'sess-dup' },
    });

    await conversarComIA(req, res);
    expect(res.statusCode).toBe(200);

    const promptEnviado = mockGenerateContent.mock.calls[0][0];
    expect(typeof promptEnviado).toBe('string');

    const ocorrencias = promptEnviado.split(mensagem).length - 1;
    // Uma vez na seção CURRENT USER MESSAGE; histórico prévio estava vazio
    expect(ocorrencias).toBe(1);
    expect(promptEnviado).toMatch(/CURRENT USER MESSAGE/);
    expect(promptEnviado).toMatch(/SYSTEM INSTRUCTIONS/);
  });

  test('exports e modos válidos estão corretos', () => {
    expect(MODOS_VALIDOS).toEqual([
      'geral',
      'dieta',
      'treino',
      'educacao',
      'economico',
    ]);
    expect(MAX_MENSAGEM_CHARS).toBe(2000);
    expect(typeof conversarComIA).toBe('function');
  });

  test('modo "normal" (padrão enviado pelo front) é aceito como "geral"', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: { mensagem: 'Monte um jantar leve com frango', modo: 'normal' },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resposta).toMatch(/Resposta mock/);
    expect(mockGenerateContent.mock.calls[0][0]).toMatch(/Modo geral/);
  });

  test('modo "economico" (botão Modo Econômico do chat) é aceito e usa o prompt econômico', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: { mensagem: 'Quero uma proteína barata', modo: 'economico' },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockGenerateContent.mock.calls[0][0]).toMatch(/Modo Econômico/);
  });

  test('session_id maior que o VARCHAR(64) da tabela é truncado', async () => {
    const { req, res } = mockReqRes({
      userId: 1,
      body: { mensagem: 'Monte um lanche', session_id: 'a'.repeat(200) },
    });

    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.session_id).toHaveLength(MAX_SESSION_ID_CHARS);
  });

  test('histórico em memória tem teto e descarta as conversas mais antigas', () => {
    for (let i = 0; i < MAX_SESSOES_EM_MEMORIA + 25; i++) {
      _test.getOrCreateHistory(1, `sessao-${i}`);
    }

    expect(_test.sessionCount()).toBe(MAX_SESSOES_EM_MEMORIA);
    // a mais antiga saiu; a mais recente continua
    expect(_test.getHistorySnapshot(1, 'sessao-0')).toEqual([]);
    _test.appendToHistory(1, `sessao-${MAX_SESSOES_EM_MEMORIA + 24}`, 'user', 'oi');
    expect(
      _test.getHistorySnapshot(1, `sessao-${MAX_SESSOES_EM_MEMORIA + 24}`)
    ).toHaveLength(1);
  });
});
