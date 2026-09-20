process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars!!';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

const mockGenerateContent = jest.fn();
const mockQueries = [];
let mockHandler = async () => ({ recordset: [], rowsAffected: [0] });

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
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
      mockQueries.push(q);
      return mockHandler(q);
    }
  }

  return {
    sql: { Int: 'Int', NVarChar: 'NVarChar', VarChar: 'VarChar' },
    poolPromise: Promise.resolve({ request: () => new Request() }),
  };
});

const { conversarComIA } = require('../src/controllers/chatController');

function mockReqRes(body) {
  const req = { usuario: { id: 7 }, body };
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

const FICHA = {
  id: 55,
  objetivo: 'perder_peso',
  total_kcal: 1800,
  total_proteina: 120,
  total_carboidratos: 200,
  total_gordura: 50,
  total_fibra: 30,
};

function erroColunaInvalida() {
  const err = new Error("Invalid column name 'ficha_id'.");
  err.number = 207;
  return err;
}

describe('Chat — ficha do usuário e resiliência', () => {
  beforeEach(() => {
    mockQueries.length = 0;
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'Resposta mock da Salus.' },
    });
  });

  test('lê os alimentos da ficha pela coluna ficha_id (esquema atual)', async () => {
    mockHandler = async (q) => {
      if (q.includes('FROM fichaAlimentar')) return { recordset: [FICHA] };
      if (q.includes('FROM fichaAlimentos WHERE ficha_id')) {
        return { recordset: [{ nome_alimento: 'Arroz' }, { nome_alimento: 'Feijão' }] };
      }
      return { recordset: [], rowsAffected: [1] };
    };

    const { req, res } = mockReqRes({ mensagem: 'Monte meu almoço' });
    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockGenerateContent.mock.calls[0][0]).toMatch(
      /Alimentos escolhidos na ficha: Arroz, Feijão/
    );
    expect(mockQueries.some((q) => q.includes('[fich-id]'))).toBe(false);
  });

  test('cai para [fich-id] quando o banco ainda tem o esquema legado', async () => {
    mockHandler = async (q) => {
      if (q.includes('FROM fichaAlimentar')) return { recordset: [FICHA] };
      if (q.includes('FROM fichaAlimentos WHERE ficha_id')) throw erroColunaInvalida();
      if (q.includes('FROM fichaAlimentos WHERE [fich-id]')) {
        return { recordset: [{ nome_alimento: 'Banana' }] };
      }
      return { recordset: [], rowsAffected: [1] };
    };

    const { req, res } = mockReqRes({ mensagem: 'Monte meu lanche' });
    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockGenerateContent.mock.calls[0][0]).toMatch(
      /Alimentos escolhidos na ficha: Banana/
    );
  });

  test('falha ao gravar o histórico não descarta a resposta da IA', async () => {
    mockHandler = async (q) => {
      if (q.includes('INSERT INTO chatHistorico')) throw new Error('banco indisponível');
      return { recordset: [], rowsAffected: [0] };
    };

    const { req, res } = mockReqRes({ mensagem: 'Monte meu jantar' });
    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resposta).toMatch(/Resposta mock da Salus/);
  });

  test('falha ao gravar o histórico também não derruba respostas prontas', async () => {
    mockHandler = async (q) => {
      if (q.includes('INSERT INTO chatHistorico')) throw new Error('banco indisponível');
      return { recordset: [], rowsAffected: [0] };
    };

    const { req, res } = mockReqRes({ mensagem: 'ovo engorda?' });
    await conversarComIA(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resposta).toMatch(/ovo é uma ótima fonte de proteína/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
