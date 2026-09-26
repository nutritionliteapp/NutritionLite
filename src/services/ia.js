/**
 * Utilidades compartilhadas pelos recursos que usam Gemini (rótulos, diário por foto, cardápio).
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODELO = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
/** ~4,5 MB decodificados por imagem. */
const MAX_BYTES_BASE64 = 6 * 1024 * 1024;
const TIMEOUT_PADRAO_MS = 60_000;

let modelo = null;
function obterModelo() {
  if (!modelo) {
    modelo = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: MODELO });
  }
  return modelo;
}

function iaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function limparBase64(s) {
  if (!s || typeof s !== 'string') return { mime: null, data: '' };
  const trimmed = s.trim();
  const dataUrl = trimmed.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrl) {
    return { mime: dataUrl[1].split(';')[0].toLowerCase(), data: dataUrl[2].replace(/\s/g, '') };
  }
  return { mime: null, data: trimmed.replace(/\s/g, '') };
}

const estimarBytes = (b64) => Math.floor((b64.length * 3) / 4);

/**
 * Valida as imagens do body e monta as partes para o Gemini.
 * @returns {{ok: true, partes: object[]} | {ok: false, mensagem: string}}
 */
function prepararImagens(imagens, { max = 4, semImagemMsg } = {}) {
  if (!Array.isArray(imagens) || imagens.length === 0) {
    return { ok: false, mensagem: semImagemMsg || 'Envie pelo menos uma imagem.' };
  }
  if (imagens.length > max) {
    return { ok: false, mensagem: `No máximo ${max} imagens por envio.` };
  }

  const partes = [];
  for (let i = 0; i < imagens.length; i++) {
    const item = imagens[i];
    const raw = item && (item.base64 ?? item.data);
    if (!raw) return { ok: false, mensagem: `Imagem ${i + 1}: campo base64 ausente.` };

    const { mime, data } = limparBase64(raw);
    const informado = typeof item.mimeType === 'string' ? item.mimeType : '';
    let final = (mime || informado || 'image/jpeg').toLowerCase().split(';')[0];
    if (final === 'image/jpg') final = 'image/jpeg';
    if (!MIME_PERMITIDOS.has(final)) {
      return { ok: false, mensagem: `Imagem ${i + 1}: tipo não permitido. Use JPEG, PNG ou WebP.` };
    }
    if (estimarBytes(data) > MAX_BYTES_BASE64) {
      return {
        ok: false,
        mensagem: `Imagem ${i + 1}: arquivo muito grande. Comprima ou envie fotos menores (máx. ~4 MB por imagem).`,
      };
    }
    partes.push({ inlineData: { mimeType: final, data } });
  }
  return { ok: true, partes };
}

/** Extrai o primeiro objeto JSON de uma resposta que pode vir com cercas de markdown. */
function extrairJson(texto) {
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

function comTimeout(promessa, ms = TIMEOUT_PADRAO_MS, rotulo = 'gemini') {
  let timer;
  const limite = new Promise((_, rejeita) => {
    timer = setTimeout(() => rejeita(new Error(`Timeout após ${ms}ms (${rotulo})`)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

/** Gera conteúdo e devolve o texto da resposta. */
async function gerarTexto(conteudo, { ms = TIMEOUT_PADRAO_MS, rotulo = 'gemini' } = {}) {
  const resultado = await comTimeout(obterModelo().generateContent(conteudo), ms, rotulo);
  return resultado.response.text();
}

/** Texto seguro para entrar num prompt: sem quebras que "fechem" instruções e com tamanho limitado. */
function textoParaPrompt(valor, max = 200) {
  return String(valor ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>{}`]/g, '')
    .trim()
    .slice(0, max);
}

module.exports = {
  MODELO,
  MIME_PERMITIDOS,
  iaConfigurada,
  prepararImagens,
  extrairJson,
  comTimeout,
  gerarTexto,
  textoParaPrompt,
  limparBase64,
};
