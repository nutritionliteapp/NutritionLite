const { sql, poolPromise } = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const preencherAlimentos = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP 597 nome_alimento 
      FROM tbltacoNL 
      WHERE preco_medio IS NULL OR preco_medio = 0
    `);

    const alimentos = result.recordset.map(a => a.nome_alimento);

    const prompt = `
Gere um JSON no formato:
[
  {"alimento": "nome", "preco": 0.00, "unidade": "kg/g/unidade/pacote"}
]
com preços médios estimados em reais (R$) no Brasil, baseados em mercados populares.

Regras:
- Pesquise o preço real do alimento no Brasil. (em fontes confiáveis)
- Use o preço médio encontrado no Brasil.
- Se não encontrar o preço real, use o preço médio encontrado no Brasil.
- Para grãos (arroz, feijão, lentilha): preço médio por pacote de 1kg.
- Para bebidas: preço médio por litro ou garrafa.
- Para frutas, legumes e verduras: preço médio por 1kg.
- Para bolachas, salgadinhos e produtos de pacote: preço médio por pacote comum.
- Use valores realistas, entre R$0,50 e R$200, dependendo do alimento.
- Não repita alimentos.  
- Gere apenas o JSON puro, sem texto adicional.
- Autialize todos os alimentos sempre que for possível. 

Lista de alimentos:
${alimentos.join(', ')}
`;

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash-latest" });
    const resultGemini = await model.generateContent(prompt);
    const respostaTexto = resultGemini.response.text();

    console.log('Resposta da IA:', respostaTexto);

    let lista;
    try {
      const jsonStr = respostaTexto
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      lista = JSON.parse(jsonStr);
    } catch (err) {
      console.error('Erro ao converter resposta da IA para JSON:', err);
      return res.status(500).json({ erro: 'Falha ao interpretar resposta da IA.', resposta: respostaTexto });
    }

    let atualizados = 0;

    for (const item of lista) {
      if (item.alimento && item.preco) {
        await pool.request()
          .input('preco', sql.Decimal(6, 2), item.preco)
          .input('nome', sql.VarChar, item.alimento)
          .query('UPDATE tbltacoNL SET preco_medio = @preco WHERE nome_alimento = @nome');
        atualizados++;
      }
    }

    res.json({
      mensagem: `Preços preenchidos automaticamente com sucesso! (${atualizados} atualizados)`,
      lista
    });

  } catch (error) {
    console.error('Erro ao preencher preços automaticamente:', error);
    res.status(500).json({ erro: 'Erro interno ao gerar preços médios.' });
  }
};

module.exports = { preencherAlimentos };
