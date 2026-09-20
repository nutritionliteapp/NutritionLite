require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGENS = 4;
const MAX_BYTES_BASE64 = 6 * 1024 * 1024; // ~4.5MB decodificado por imagem (limite prático)

const DISCLAIMER_EDUCATIVO =
  'Esta análise é educativa e não substitui orientação de nutricionista ou médico. Leia sempre o rótulo oficial do produto.';

function limparBase64(s) {
  if (!s || typeof s !== 'string') return { mime: null, data: '' };
  const trimmed = s.trim();
  const dataUrl = trimmed.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrl) {
    return {
      mime: dataUrl[1].split(';')[0].toLowerCase(),
      data: dataUrl[2].replace(/\s/g, ''),
    };
  }
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

function isString(v) {
  return typeof v === 'string';
}

function isNotaSaudabilidadeValida(v) {
  if (v === null) return true;
  if (typeof v !== 'number' || Number.isNaN(v)) return false;
  return v >= 0 && v <= 100;
}

/**
 * Valida o JSON da IA contra o schema esperado.
 * Retorna { ok: true, analise } ou { ok: false }.
 */
function validarAnaliseRotulo(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false };
  }

  if (!isNotaSaudabilidadeValida(json.nota_saudabilidade)) {
    return { ok: false };
  }
  if (!isString(json.nivel)) return { ok: false };
  if (!isString(json.resumo_produto)) return { ok: false };
  if (!isString(json.tabela_nutricional_resumo)) return { ok: false };
  if (!Array.isArray(json.ingredientes_explicados)) return { ok: false };
  if (!Array.isArray(json.pontos_atencao)) return { ok: false };

  for (const item of json.ingredientes_explicados) {
    if (!item || typeof item !== 'object') return { ok: false };
    if (!isString(item.termo_original) || !isString(item.explicacao_simples)) {
      return { ok: false };
    }
    if (item.observacao != null && !isString(item.observacao)) return { ok: false };
  }

  for (const p of json.pontos_atencao) {
    if (!isString(p)) return { ok: false };
  }

  const disclaimer =
    isString(json.disclaimer) && json.disclaimer.trim()
      ? json.disclaimer.trim()
      : DISCLAIMER_EDUCATIVO;

  return {
    ok: true,
    analise: {
      nota_saudabilidade: json.nota_saudabilidade,
      nivel: json.nivel,
      resumo_produto: json.resumo_produto,
      tabela_nutricional_resumo: json.tabela_nutricional_resumo,
      ingredientes_explicados: json.ingredientes_explicados,
      pontos_atencao: json.pontos_atencao,
      disclaimer,
    },
  };
}

const analisarRotulos = async (req, res) => {
  const inicio = Date.now();
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(503)
        .json({ mensagem: 'Serviço de IA não configurado (GEMINI_API_KEY).' });
    }

    const { imagens } = req.body;
    if (!Array.isArray(imagens) || imagens.length === 0) {
      return res.status(400).json({
        mensagem:
          'Envie pelo menos uma foto da tabela nutricional e/ou da lista de ingredientes.',
      });
    }
    if (imagens.length > MAX_IMAGENS) {
      return res
        .status(400)
        .json({ mensagem: `No máximo ${MAX_IMAGENS} imagens por análise.` });
    }

    const partesImagem = [];
    for (let i = 0; i < imagens.length; i++) {
      const item = imagens[i];
      const raw = item?.base64 ?? item?.data;
      if (!raw) {
        return res
          .status(400)
          .json({ mensagem: `Imagem ${i + 1}: campo base64 ausente.` });
      }
      const { mime, data } = limparBase64(raw);
      const mimeInformado = typeof item.mimeType === 'string' ? item.mimeType : '';
      let mimeFinal = (mime || mimeInformado || 'image/jpeg')
        .toLowerCase()
        .split(';')[0];
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
  "nota_saudabilidade": <número 0-100 ou null se ilegível>,
  "nivel": "<string curta: Ex.: Bom / Regular / Ruim>",
  "resumo_produto": "<1-3 frases sobre o que parece ser o produto>",
  "tabela_nutricional_resumo": "<texto curto ou string vazia se ilegível>",
  "ingredientes_explicados": [
    { "termo_original": "<como no rótulo>", "explicacao_simples": "<o que é, em português claro>", "observacao": "<opcional>" }
  ],
  "pontos_atencao": [ "<bullet 1>", "<bullet 2>" ],
  "disclaimer": "${DISCLAIMER_EDUCATIVO}"
}

Se as imagens estiverem ilegíveis ou não forem de rótulo, use nota_saudabilidade null e explique em resumo_produto.`;

    const result = await model.generateContent([{ text: instrucao }, ...partesImagem]);
    const texto = result.response.text();
    const json = extrairJsonDaResposta(texto);
    const validado = validarAnaliseRotulo(json);

    logger.info(
      `rotulos analisar latencia_ms=${Date.now() - inicio} imagens=${imagens.length} parse_ok=${Boolean(json)} schema_ok=${validado.ok}`
    );

    if (!validado.ok) {
      return res.status(502).json({
        mensagem:
          'Não foi possível validar a análise do rótulo. Tente outra foto ou tente novamente mais tarde.',
        disclaimer: DISCLAIMER_EDUCATIVO,
      });
    }

    return res.status(200).json({
      parseado: true,
      analise: validado.analise,
      disclaimer: DISCLAIMER_EDUCATIVO,
    });
  } catch (err) {
    logger.error(`analisarRotulos: ${err.message}`);
    return res.status(500).json({
      mensagem: 'Erro ao analisar rótulos. Tente novamente.',
      disclaimer: DISCLAIMER_EDUCATIVO,
    });
  }
};

module.exports = {
  analisarRotulos,
  validarAnaliseRotulo,
  DISCLAIMER_EDUCATIVO,
};
