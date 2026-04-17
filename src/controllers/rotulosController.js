require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGENS = 4;
const MAX_BYTES_BASE64 = 6 * 1024 * 1024; // ~4.5MB decodificado por imagem (limite prático)

function limparBase64(s) {
  if (!s || typeof s !== 'string') return '';
  const trimmed = s.trim();
  const dataUrl = trimmed.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrl) return { mime: dataUrl[1].split(';')[0].toLowerCase(), data: dataUrl[2].replace(/\s/g, '') };
  return { mime: null, data: trimmed.replace(/\s/g, '') };
}

function estimarTamanhoBytesBase64(b64) {
  return Math.floor((b64.length * 3) / 4);
}

function extrairJsonDaResposta(texto) {
  if (!texto) return null;
  const limpo = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = limpo.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const analisarRotulos = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ mensagem: 'Serviço de IA não configurado (GEMINI_API_KEY).' });
    }

    const { imagens } = req.body;
    if (!Array.isArray(imagens) || imagens.length === 0) {
      return res.status(400).json({
        mensagem: 'Envie pelo menos uma foto da tabela nutricional e/ou da lista de ingredientes.',
      });
    }
    if (imagens.length > MAX_IMAGENS) {
      return res.status(400).json({ mensagem: `No máximo ${MAX_IMAGENS} imagens por análise.` });
    }

    const partesImagem = [];
    for (let i = 0; i < imagens.length; i++) {
      const item = imagens[i];
      const raw = item?.base64 ?? item?.data;
      if (!raw) {
        return res.status(400).json({ mensagem: `Imagem ${i + 1}: campo base64 ausente.` });
      }
      const { mime, data } = limparBase64(raw);
      let mimeFinal = (mime || item.mimeType || 'image/jpeg').toLowerCase().split(';')[0];
      if (mimeFinal === 'image/jpg') mimeFinal = 'image/jpeg';
      if (!MIME_PERMITIDOS.has(mimeFinal)) {
        return res.status(400).json({
          mensagem: `Imagem ${i + 1}: tipo não permitido. Use JPEG, PNG ou WebP.`,
        });
      }
      if (estimarTamanhoBytesBase64(data) > MAX_BYTES_BASE64) {
        return res.status(400).json({
          mensagem: `Imagem ${i + 1}: arquivo muito grande. Comprima ou envie fotos menores (máx. ~4 MB por imagem).`,
        });
      }
      partesImagem.push({
        inlineData: {
          mimeType: mimeFinal,
          data,
        },
      });
    }

    const model = genAI.getGenerativeModel({ model: MODELO });

    const instrucao = `Você é um assistente de educação alimentar do app NutritionLite (Brasil).
O usuário enviou uma ou mais fotos de rótulo de produto industrializado (tabela nutricional e/ou lista de ingredientes).

Tarefas:
1) Leia o que for legível nas imagens (OCR mental).
2) Explique em linguagem simples os ingredientes com nomes técnicos (conservantes, adoçantes, espessantes, corantes, etc.): diga o que são e para que servem, sem alarmismo.
3) Resuma a tabela nutricional em poucas linhas (porções, calorias, açúcares, sódio, gorduras saturadas, etc., se visíveis).
4) Atribua uma NOTA DE SAUDABILIDADE de 0 a 100 para uso ocasional em uma alimentação variada (não é diagnóstico médico).
   - 80–100: em geral boas escolhas, poucos aditivos problemáticos, bom perfil nutricional relativo.
   - 50–79: moderado; atenção a sódio/açúcar/gordura ou vários aditivos.
   - 0–49: ultraprocessado ou alto em sódio/açúcar/gorduras de má qualidade, muitos aditivos — consumir raramente.

IMPORTANTE: Responda APENAS com um único objeto JSON válido (sem markdown), neste formato exato:
{
  "nota_saudabilidade": <número inteiro 0-100>,
  "nivel": "<string curta: Ex.: Bom / Regular / Ruim>",
  "resumo_produto": "<1-3 frases sobre o que parece ser o produto>",
  "tabela_nutricional_resumo": "<texto curto ou string vazia se ilegível>",
  "ingredientes_explicados": [
    { "termo_original": "<como no rótulo>", "explicacao_simples": "<o que é, em português claro>", "observacao": "<opcional: ex. presente em muitos ultraprocessados>" }
  ],
  "pontos_atencao": [ "<bullet 1>", "<bullet 2>" ],
  "disclaimer": "Esta análise é educativa e não substitui orientação de nutricionista ou médico. Leia sempre o rótulo oficial do produto."
}

Se as imagens estiverem ilegíveis ou não forem de rótulo, use nota_saudabilidade null e explique em resumo_produto.`;

    const result = await model.generateContent([{ text: instrucao }, ...partesImagem]);
    const texto = result.response.text();
    const json = extrairJsonDaResposta(texto);

    if (!json) {
      return res.status(200).json({
        bruto: texto,
        mensagem: 'A IA respondeu em formato inesperado. Veja o campo bruto ou tente outra foto.',
        parseado: false,
      });
    }

    return res.status(200).json({
      parseado: true,
      analise: json,
    });
  } catch (err) {
    console.error('analisarRotulos:', err);
    return res.status(500).json({
      mensagem: err.message || 'Erro ao analisar rótulos. Tente novamente.',
    });
  }
};

module.exports = { analisarRotulos };
