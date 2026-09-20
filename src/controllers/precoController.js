const { poolPromise } = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Gera ESTIMATIVAS de preço via IA.
 * NÃO grava em tbltacoNL.preco_medio — apenas retorna estimativas.
 */
const preencherAlimentos = async (req, res) => {
  const inicio = Date.now();
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP 597 nome_alimento 
      FROM tbltacoNL 
      WHERE preco_medio IS NULL OR preco_medio = 0
    `);

    const alimentos = result.recordset.map((a) => a.nome_alimento);
    const coletadoEm = new Date().toISOString();

    const prompt = `
Gere um JSON no formato:
[
  {"alimento": "nome", "preco_estimado": 0.00, "unidade": "kg/g/unidade/pacote"}
]
com ESTIMATIVAS de preços médios em reais (R$) no Brasil (mercados populares).

IMPORTANTE:
- São ESTIMATIVAS, não preços reais pesquisados em tempo real.
- Não afirme que os valores foram coletados de fontes oficiais.
- Para grãos (arroz, feijão, lentilha): estimativa por pacote de 1kg.
- Para bebidas: estimativa por litro ou garrafa.
- Para frutas, legumes e verduras: estimativa por 1kg.
- Para bolachas, salgadinhos e produtos de pacote: estimativa por pacote comum.
- Use valores realistas, entre R$0,50 e R$200, dependendo do alimento.
- Não repita alimentos.
- Gere apenas o JSON puro, sem texto adicional.

Lista de alimentos:
${alimentos.join(', ')}
`;

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    });
    const resultGemini = await model.generateContent(prompt);
    const respostaTexto = resultGemini.response.text();

    let listaBruta;
    try {
      const jsonStr = respostaTexto
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      listaBruta = JSON.parse(jsonStr);
    } catch (err) {
      logger.error(`precos: falha ao parsear JSON da IA: ${err.message}`);
      return res.status(500).json({
        erro: 'Falha ao interpretar resposta da IA.',
        tipo: 'estimativa_ia',
      });
    }

    if (!Array.isArray(listaBruta)) {
      return res.status(502).json({
        erro: 'Formato inesperado da IA (esperado array de estimativas).',
        tipo: 'estimativa_ia',
      });
    }

    const estimativas = listaBruta
      .filter(
        (item) =>
          item &&
          typeof item.alimento === 'string' &&
          (typeof item.preco_estimado === 'number' ||
            typeof item.preco === 'number')
      )
      .map((item) => ({
        alimento: item.alimento,
        preco_estimado:
          typeof item.preco_estimado === 'number'
            ? item.preco_estimado
            : item.preco,
        unidade: typeof item.unidade === 'string' ? item.unidade : 'unidade',
        fonte: 'estimativa_ia',
        localidade: 'BR',
        coletado_em: coletadoEm,
      }));

    logger.info(
      `precos estimativas geradas count=${estimativas.length} solicitados=${alimentos.length} latencia_ms=${Date.now() - inicio}`
    );

    return res.json({
      mensagem:
        'Estimativas de preço geradas pela IA. NÃO são preços reais pesquisados e NÃO foram gravadas em tbltacoNL.preco_medio.',
      tipo: 'ESTIMATIVAS',
      fonte: 'estimativa_ia',
      localidade: 'BR',
      coletado_em: coletadoEm,
      total: estimativas.length,
      estimativas,
    });
  } catch (error) {
    logger.error(`Erro ao gerar estimativas de preço: ${error.message}`);
    return res
      .status(500)
      .json({ erro: 'Erro interno ao gerar estimativas de preço.' });
  }
};

module.exports = { preencherAlimentos };
